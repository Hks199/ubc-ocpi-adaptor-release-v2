/**
 * Razorpay Payment Gateway Service
 * Documentation: https://razorpay.com/docs/payments/payment-gateway/s2s-integration/
 * 
 * Implements:
 * - Create Order: https://razorpay.com/docs/api/orders/
 * - Create UPI Payment (Intent): https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/intent/
 * - Create UPI Payment (Collect): https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/collect/
 * - Fetch Payment: https://razorpay.com/docs/api/payments/
 * - Fetch Order Payments: https://razorpay.com/docs/api/orders/
 * - Create Refund: https://razorpay.com/docs/api/refunds/
 * - Fetch Refund: https://razorpay.com/docs/api/refunds/
 * - Validate VPA: https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/collect/
 * 
 * Authentication: Basic Auth with Key ID and Key Secret
 */
import axios, { AxiosRequestConfig } from 'axios';
import * as crypto from 'crypto';
import { logger } from '../../../../services/logger.service';
import RazorpayInitializerService from './RazorpayInitializerService';
import {
    RazorpayCreateOrderRequest,
    RazorpayCreateOrderResponse,
    RazorpayCreateUPIPaymentRequest,
    RazorpayCreateUPIPaymentResponse,
    RazorpayPaymentResponse,
    RazorpayOrderPaymentsResponse,
    RazorpayCreateRefundRequest,
    RazorpayRefundResponse,
    RazorpayValidateVPAResponse,
    RazorpayCreateCustomerRequest,
    RazorpayCustomerResponse,
    RazorpayTokensResponse,
    RazorpayErrorResponse,
} from '../../../../types/Razorpay';
import PaymentTxnDbService from '../../../../db-services/PaymentTxnDbService';
import GenericPaymentService from '../Generic';
import {
    buildMockRazorpayOrder,
    buildMockUPIPaymentResponse,
    isRazorpayFakeWithoutCredentialsEnabled,
    isRazorpayMockMode,
} from './razorpayMock.util';

// Helper function to extract error message from unknown error
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
};

// Helper function to get axios response data from error
const getAxiosErrorData = (error: unknown): RazorpayErrorResponse | any => {
    if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: any; status?: number } };
        return axiosError.response?.data;
    }
    return undefined;
};

// Helper function to get axios response status from error
const getAxiosErrorStatus = (error: unknown): number | undefined => {
    if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } };
        return axiosError.response?.status;
    }
    return undefined;
};

export default class RazorpayPaymentGatewayService {
    /**
     * Get credentials from partner configuration
     * @param partnerId - Partner ID to get credentials from
     */
    public static async getCredentials(partnerId: string): Promise<{
        external_integration_id: string;
        credentials: {
            key_id: string;
            key_secret: string;
            api_url: string;
            webhook_secret?: string;
            fee_percentage?: number;
        };
    } | null> {
        const razorpayCredentials = await RazorpayInitializerService.getRazorpayCredentials(partnerId);
        
        if (!razorpayCredentials || !razorpayCredentials.credentials) {
            return null;
        }
        
        const credentials = razorpayCredentials.credentials;
        const razorpayCredentialsId = razorpayCredentials.external_integration_id;
        
        return {
            external_integration_id: razorpayCredentialsId,
            credentials: {
                key_id: credentials.KEY_ID || '',
                key_secret: credentials.KEY_SECRET || '',
                api_url: credentials.API_URL || 'https://api.razorpay.com/v1',
                webhook_secret: credentials.WEBHOOK_SECRET,
                fee_percentage: credentials.FEE_PERCENTAGE,
            },
        };
    }

    /**
     * Make authenticated request to Razorpay API
     * Uses Basic Auth with Key ID and Key Secret
     */
    private static async makeRequest<T>(
        method: 'GET' | 'POST',
        url: string,
        keyId: string,
        keySecret: string,
        data?: object
    ): Promise<T> {
        const config: AxiosRequestConfig = {
            method,
            url,
            auth: {
                username: keyId,
                password: keySecret,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data && (method === 'POST')) {
            config.data = data;
        }

        const response = await axios(config);
        return response.data;
    }

    /**
     * Create a Razorpay order
     * Reference: https://razorpay.com/docs/api/orders/
     * @param order - Order request payload
     * @param partnerId - Partner ID for credentials
     */
    public static async createOrder(
        order: RazorpayCreateOrderRequest,
        partnerId: string,
    ): Promise<{
        success: boolean;
        razorpay_order?: RazorpayCreateOrderResponse;
        external_integration_id?: string;
        error?: string;
        error_details?: any;
    }> {
        try {
            if (isRazorpayMockMode()) {
                logger.warn('Razorpay: RAZORPAY_MOCK is on — synthetic order only (no Razorpay API)', {
                    partnerId,
                    receipt: order.receipt,
                });
                const razorpay_order = buildMockRazorpayOrder({
                    amount: order.amount,
                    receipt: order.receipt || `rcpt_mock_${partnerId.slice(0, 8)}`,
                    notes: order.notes as Record<string, string> | undefined,
                });
                return {
                    success: true,
                    razorpay_order,
                    external_integration_id: partnerId,
                };
            }

            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                if (isRazorpayFakeWithoutCredentialsEnabled()) {
                    logger.warn('Razorpay: no credentials — synthetic order (fake / dev mode)', { partnerId });
                    const razorpay_order = buildMockRazorpayOrder({
                        amount: order.amount,
                        receipt: order.receipt || `rcpt_mock_${partnerId.slice(0, 8)}`,
                        notes: order.notes as Record<string, string> | undefined,
                    });
                    return {
                        success: true,
                        razorpay_order,
                        external_integration_id: partnerId,
                    };
                }
                logger.error('Razorpay: Failed to create order - External Integration not found', undefined, {
                    order,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            logger.info('Razorpay: Creating order', {
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                partnerId,
            });

            const response = await this.makeRequest<RazorpayCreateOrderResponse>(
                'POST',
                `${apiUrl}/orders`,
                keyId,
                keySecret,
                order
            );

            logger.info('Razorpay: Order created successfully', {
                order_id: response.id,
                status: response.status,
            });

            return {
                success: true,
                razorpay_order: response,
                external_integration_id: razorpayCredentials.external_integration_id,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const statusCode = getAxiosErrorStatus(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to create order - ${errorMessage}`, err, {
                order,
                partnerId,
                statusCode,
                response_data: errorData,
            });

            return {
                success: false,
                error: errorData?.error?.description || `${errorMessage} (Status: ${statusCode})`,
                error_details: {
                    razorpay_error: errorData?.error,
                    status_code: statusCode,
                    error_code: errorData?.error?.code,
                },
            };
        }
    }

    /**
     * Create a UPI payment (Intent or Collect flow)
     * Reference: https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/
     * @param request - UPI payment request payload
     * @param partnerId - Partner ID for credentials
     */
    public static async createUPIPayment(
        request: RazorpayCreateUPIPaymentRequest,
        partnerId: string,
    ): Promise<{
        success: boolean;
        payment?: RazorpayCreateUPIPaymentResponse;
        external_integration_id?: string;
        error?: string;
        error_details?: any;
    }> {
        try {
            if (isRazorpayMockMode()) {
                logger.warn('Razorpay: RAZORPAY_MOCK is on — synthetic UPI payment only (no Razorpay API)', {
                    partnerId,
                    order_id: request.order_id,
                });
                const payment = buildMockUPIPaymentResponse({
                    orderId: request.order_id,
                    amountPaisa: request.amount,
                });
                return {
                    success: true,
                    payment,
                    external_integration_id: partnerId,
                };
            }

            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                if (isRazorpayFakeWithoutCredentialsEnabled()) {
                    logger.warn('Razorpay: no credentials — synthetic UPI payment (fake / dev mode)', {
                        partnerId,
                        order_id: request.order_id,
                    });
                    const payment = buildMockUPIPaymentResponse({
                        orderId: request.order_id,
                        amountPaisa: request.amount,
                    });
                    return {
                        success: true,
                        payment,
                        external_integration_id: partnerId,
                    };
                }
                logger.error('Razorpay: Failed to create UPI payment - External Integration not found', undefined, {
                    request,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            // Build clean request with only required fields to avoid fee tampering errors
            // Razorpay S2S UPI requires: amount, currency, order_id, email, contact, method, upi
            const cleanRequest: Record<string, unknown> = {
                amount: request.amount,
                currency: request.currency,
                order_id: request.order_id,
                method: 'upi',
                upi: {
                    flow: request.upi.flow,
                },
            };

            // Add optional UPI fields only if provided
            if (request.upi.vpa) {
                (cleanRequest.upi as Record<string, unknown>).vpa = request.upi.vpa;
            }
            if (request.upi.expiry_time) {
                (cleanRequest.upi as Record<string, unknown>).expiry_time = request.upi.expiry_time;
            }

            // Add customer fields - required for S2S
            if (request.email) cleanRequest.email = request.email;
            if (request.contact) cleanRequest.contact = request.contact;
            // Contact should not have + prefix for Razorpay

            // S2S required fields - ip, referer, user_agent
            // These are mandatory for server-to-server integration
            cleanRequest.ip = request.ip || '192.168.0.1';
            cleanRequest.referer = request.referer || 'https://pulseenergy.io/';
            cleanRequest.user_agent = request.user_agent || 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36';

            // Optional fields
            if (request.description) cleanRequest.description = request.description;
            if (request.customer_id) cleanRequest.customer_id = request.customer_id;
            if (request.save !== undefined) cleanRequest.save = request.save;
            if (request.callback_url) cleanRequest.callback_url = request.callback_url;
            if (request.notes && Object.keys(request.notes).length > 0) {
                cleanRequest.notes = request.notes;
            }
            // Fee parameter for CFB (Customer Fee Bearer) - required when CFB is enabled

            cleanRequest.fee = request.fee;

            logger.info('Razorpay: Creating UPI payment', {
                amount: request.amount,
                order_id: request.order_id,
                upi_flow: request.upi.flow,
                partnerId,
                cleanRequestKeys: Object.keys(cleanRequest),
            });

            const response = await this.makeRequest<RazorpayCreateUPIPaymentResponse>(
                'POST',
                `${apiUrl}/payments/create/upi`,
                keyId,
                keySecret,
                cleanRequest
            );

            logger.info('Razorpay: UPI payment created successfully', {
                payment_id: response.razorpay_payment_id,
                has_link: !!response.link,
            });

            return {
                success: true,
                payment: response,
                external_integration_id: razorpayCredentials.external_integration_id,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const statusCode = getAxiosErrorStatus(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to create UPI payment - ${errorMessage}`, err, {
                request,
                partnerId,
                statusCode,
                response_data: errorData,
            });

            return {
                success: false,
                error: errorData?.error?.description || `${errorMessage} (Status: ${statusCode})`,
                error_details: {
                    razorpay_error: errorData?.error,
                    status_code: statusCode,
                    error_code: errorData?.error?.code,
                },
            };
        }
    }

    /**
     * Fetch a payment by ID
     * @param paymentId - Razorpay Payment ID
     * @param partnerId - Partner ID for credentials
     */
    public static async fetchPayment(
        paymentId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        payment?: RazorpayPaymentResponse;
        status?: number;
        error?: string;
    }> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to fetch payment - External Integration not found', undefined, {
                    paymentId,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            const response = await this.makeRequest<RazorpayPaymentResponse>(
                'GET',
                `${apiUrl}/payments/${paymentId}`,
                keyId,
                keySecret
            );

            logger.info('Razorpay: Payment fetched successfully', {
                payment_id: response.id,
                status: response.status,
            });

            return {
                success: true,
                payment: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorStatus = getAxiosErrorStatus(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to fetch payment - ${errorMessage}`, err, {
                paymentId,
                partnerId,
                status: errorStatus,
            });

            return {
                success: false,
                status: errorStatus,
                error: errorMessage,
            };
        }
    }

    /**
     * Fetch payments for an order
     * @param orderId - Razorpay Order ID
     * @param partnerId - Partner ID for credentials
     */
    public static async fetchOrderPayments(
        orderId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        payments?: RazorpayOrderPaymentsResponse;
        error?: string;
    }> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to fetch order payments - External Integration not found', undefined, {
                    orderId,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            const response = await this.makeRequest<RazorpayOrderPaymentsResponse>(
                'GET',
                `${apiUrl}/orders/${orderId}/payments`,
                keyId,
                keySecret
            );

            logger.info('Razorpay: Order payments fetched successfully', {
                order_id: orderId,
                count: response.count,
            });

            return {
                success: true,
                payments: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to fetch order payments - ${errorMessage}`, err, {
                orderId,
                partnerId,
            });

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Create a refund
     * Reference: https://razorpay.com/docs/api/refunds/
     * @param paymentId - Razorpay Payment ID to refund
     * @param request - Refund request payload
     */
    public static async createRefund(
        paymentId: string,
        request: RazorpayCreateRefundRequest,
    ): Promise<{
        success: boolean;
        refund?: RazorpayRefundResponse;
        error?: string;
        error_details?: any;
    }> {
        try {
            const paymentTxn = await PaymentTxnDbService.getById(paymentId);
            if (!paymentTxn) {
                logger.error('Razorpay: Failed to create refund - Payment transaction not found', undefined, {
                    paymentId,
                    request,
                });
                return { success: false, error: 'Payment transaction not found' };
            }
            const partnerId = paymentTxn.partner_id;
            const razorpayCredentials = await this.getCredentials(partnerId);            
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to create refund - External Integration not found', undefined, {
                    paymentId,
                    request,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            logger.info('Razorpay: Creating refund', {
                payment_id: paymentId,
                amount: request.amount,
                partnerId,
            });

            const response = await this.makeRequest<RazorpayRefundResponse>(
                'POST',
                `${apiUrl}/payments/${paymentTxn?.payment_gateway_payment_id}/refund`,
                keyId,
                keySecret,
                request
            );

            logger.info('Razorpay: Refund created successfully', {
                refund_id: response.id,
                status: response.status,
            });

            return {
                success: true,
                refund: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const statusCode = getAxiosErrorStatus(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to create refund - ${errorMessage}`, err, {
                paymentId,
                request,
                response_data: errorData,
            });

            return {
                success: false,
                error: errorData?.error?.description || errorMessage,
                error_details: {
                    razorpay_error: errorData?.error,
                    status_code: statusCode,
                },
            };
        }
    }

    /**
     * Fetch a refund by ID
     * @param refundId - Razorpay Refund ID
     * @param partnerId - Partner ID for credentials
     */
    public static async fetchRefund(
        refundId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        refund?: RazorpayRefundResponse;
        error?: string;
    }> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to fetch refund - External Integration not found', undefined, {
                    refundId,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            const response = await this.makeRequest<RazorpayRefundResponse>(
                'GET',
                `${apiUrl}/refunds/${refundId}`,
                keyId,
                keySecret
            );

            logger.info('Razorpay: Refund fetched successfully', {
                refund_id: response.id,
                status: response.status,
            });

            return {
                success: true,
                refund: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to fetch refund - ${errorMessage}`, err, {
                refundId,
                partnerId,
            });

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Validate a VPA
     * Reference: https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/collect/
     * @param vpa - VPA/UPI ID to validate
     * @param partnerId - Partner ID for credentials
     */
    public static async validateVPA(
        vpa: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        validation?: RazorpayValidateVPAResponse;
        error?: string;
    }> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to validate VPA - External Integration not found', undefined, {
                    vpa,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            const response = await this.makeRequest<RazorpayValidateVPAResponse>(
                'POST',
                `${apiUrl}/payments/validate/vpa`,
                keyId,
                keySecret,
                { vpa }
            );

            logger.info('Razorpay: VPA validated', {
                vpa,
                success: response.success,
                customer_name: response.customer_name,
            });

            return {
                success: true,
                validation: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to validate VPA - ${errorMessage}`, err, {
                vpa,
                partnerId,
            });

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Create a customer
     * @param request - Customer creation request
     * @param partnerId - Partner ID for credentials
     */
    public static async createCustomer(
        request: RazorpayCreateCustomerRequest,
        partnerId: string,
    ): Promise<{
        success: boolean;
        customer?: RazorpayCustomerResponse;
        error?: string;
    }> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to create customer - External Integration not found', undefined, {
                    request,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            const response = await this.makeRequest<RazorpayCustomerResponse>(
                'POST',
                `${apiUrl}/customers`,
                keyId,
                keySecret,
                request
            );

            logger.info('Razorpay: Customer created successfully', {
                customer_id: response.id,
            });

            return {
                success: true,
                customer: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to create customer - ${errorMessage}`, err, {
                request,
                partnerId,
            });

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Fetch customer tokens
     * @param customerId - Razorpay Customer ID
     * @param partnerId - Partner ID for credentials
     */
    public static async fetchCustomerTokens(
        customerId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        tokens?: RazorpayTokensResponse;
        error?: string;
    }> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to fetch customer tokens - External Integration not found', undefined, {
                    customerId,
                    partnerId,
                });
                return { success: false, error: 'Razorpay credentials not found for partner' };
            }

            const {
                key_id: keyId,
                key_secret: keySecret,
                api_url: apiUrl,
            } = razorpayCredentials.credentials;

            const response = await this.makeRequest<RazorpayTokensResponse>(
                'GET',
                `${apiUrl}/customers/${customerId}/tokens`,
                keyId,
                keySecret
            );

            logger.info('Razorpay: Customer tokens fetched successfully', {
                customer_id: customerId,
                count: response.count,
            });

            return {
                success: true,
                tokens: response,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`Razorpay: Failed to fetch customer tokens - ${errorMessage}`, err, {
                customerId,
                partnerId,
            });

            return { success: false, error: errorMessage };
        }
    }

    /**
     * Verify webhook signature
     * @param body - Webhook request body (as string)
     * @param signature - Razorpay signature from header (X-Razorpay-Signature)
     * @param secret - Webhook secret
     * @returns Whether signature is valid
     */
    public static verifyWebhookSignature(
        body: string,
        signature: string,
        secret: string
    ): boolean {
        try {
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(body)
                .digest('hex');

            return expectedSignature === signature;
        }
        catch (e) {
            logger.error('Razorpay: Failed to verify webhook signature', e instanceof Error ? e : new Error(String(e)));
            return false;
        }
    }

    /**
     * Verify payment signature (for callback validation)
     * @param orderId - Razorpay Order ID
     * @param paymentId - Razorpay Payment ID
     * @param signature - Razorpay signature from callback
     * @param keySecret - Razorpay Key Secret
     * @returns Whether signature is valid
     */
    public static verifyPaymentSignature(
        orderId: string,
        paymentId: string,
        signature: string,
        keySecret: string
    ): boolean {
        try {
            const data = `${orderId}|${paymentId}`;
            const expectedSignature = crypto
                .createHmac('sha256', keySecret)
                .update(data)
                .digest('hex');

            return expectedSignature === signature;
        }
        catch (e) {
            logger.error('Razorpay: Failed to verify payment signature', e instanceof Error ? e : new Error(String(e)));
            return false;
        }
    }

    /**
     * Verify payment signature with partner credentials
     * @param orderId - Razorpay Order ID
     * @param paymentId - Razorpay Payment ID
     * @param signature - Razorpay signature from callback
     * @param partnerId - Partner ID for credentials
     */
    public static async verifyPaymentSignatureWithPartner(
        orderId: string,
        paymentId: string,
        signature: string,
        partnerId: string
    ): Promise<boolean> {
        try {
            const razorpayCredentials = await this.getCredentials(partnerId);
            if (!razorpayCredentials || !razorpayCredentials.credentials) {
                logger.error('Razorpay: Failed to verify signature - credentials not found', undefined, { partnerId });
                return false;
            }

            return this.verifyPaymentSignature(
                orderId,
                paymentId,
                signature,
                razorpayCredentials.credentials.key_secret
            );
        }
        catch (e) {
            logger.error('Razorpay: Failed to verify payment signature with partner', e instanceof Error ? e : new Error(String(e)));
            return false;
        }
    }

    // Status check helpers
    public static isPaymentSuccessful(status: string): boolean {
        return status === 'captured';
    }

    public static isPaymentFailed(status: string): boolean {
        return status === 'failed';
    }

    public static isPaymentPending(status: string): boolean {
        return status === 'created' || status === 'authorized';
    }

    public static isRefundSuccessful(status: string): boolean {
        return status === 'processed';
    }

    public static isRefundPending(status: string): boolean {
        return status === 'pending';
    }

    public static isRefundFailed(status: string): boolean {
        return status === 'failed';
    }

    public static isOrderPaid(status: string): boolean {
        return status === 'paid';
    }

    // amount is in paise
    public static upiIntentFee(amount: number, feePercentage: number = 0.2): {
        feeAmount: number,
        gstOnFeeAmount: number,
    } {
        const feeAmount = Math.ceil(feePercentage * amount / 100);
        const gstOnFeeAmount = GenericPaymentService.calculateGSTOnAmount(feeAmount);
        return {
            feeAmount,
            gstOnFeeAmount,
        };
    }
}
