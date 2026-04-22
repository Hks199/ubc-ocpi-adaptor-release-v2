/**
 * Payment Gateway Service
 * Handles payment gateway order creation, refunds, and status management
 */
import { OCPIPartner, PaymentTxn } from "@prisma/client";
import { logger } from "../../../../services/logger.service";
import PaymentTxnDbService from "../../../../db-services/PaymentTxnDbService";
import RazorpayPaymentService from "../Razorpay/RazorpayPaymentService";
import {
    GenericPaymentTxnStatus,
    PaymentSDK,
} from "../../../../types/Payment";
import {
    CreateUPIPaymentWithRazorpayResponse,
    RazorpayObject,
    RazorpayPaymentResponse,
} from "../../../../types/Razorpay";
import { PaymentTxnAdditionalProps } from "../../../../types/PaymentTxn";
import { BuyerDetails } from "../../../schema/v2.0.0/types/BuyerDetails";
import { BecknPaymentStatus } from "../../../schema/v2.0.0/enums/PaymentStatus";

// Types for payment gateway
interface CreatePaymentGatewayOrderResponseType {
    success: boolean;
    payment_sdk: PaymentSDK;
    amount: number;
    error?: string;
    orderId?: string;
    razorpay?: RazorpayObject;
}

// Refund types
interface RefundRequestPayload {
    payment_txn_id: string;
    refund_amount: number;
    reason?: string;
}

interface RefundResponsePayload {
    success: boolean;
    refund_id?: string;
    refund_status?: string;
    error?: string;
}

interface VerifyPaymentResponsePayload {
    success: boolean;
    payment_status?: GenericPaymentTxnStatus;
    transaction_details?: RazorpayPaymentResponse;
    error?: string;
}

export default class PaymentGatewayService {
    /**
     * Create a payment gateway order
     * Validates the payment transaction and creates an order with the appropriate payment SDK
     *
     * @param paymentTxn - Payment transaction object
     * @returns Order creation response
     */
    public static async createPaymentGatewayOrder(
        paymentTxn: PaymentTxn,
        partner: OCPIPartner,
        buyerDetails?: BuyerDetails
    ): Promise<CreatePaymentGatewayOrderResponseType | CreateUPIPaymentWithRazorpayResponse> {
        const amount = paymentTxn.amount;
        const status = paymentTxn.status;
        const additionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
        const paymentSdk = additionalProps?.payment_sdk || PaymentSDK.Razorpay;
        logger.debug('paymentSdk', {
            data: {paymentSdk, additionalProps, paymentTxn}
        });

        const response: CreatePaymentGatewayOrderResponseType = {
            success: false,
            payment_sdk: paymentSdk,
            amount: Number(amount),
            error: '',
        };

        // Validate payment transaction status (DB may use Beckn INITIATED until gateway order exists)
        const allowedPreOrderStatuses = [
            GenericPaymentTxnStatus.Pending,
            'PENDING',
            BecknPaymentStatus.INITIATED,
            'INITIATED',
        ];
        if (!allowedPreOrderStatuses.includes(status as string)) {
            logger.error('Invalid payment txn status', undefined, { paymentTxn });
            response.error = 'Invalid payment txn status';
            return response;
        }

        // Validate amount
        if (!amount || Number(amount) <= 0) {
            logger.error('Invalid payment amount', undefined, { paymentTxn });
            response.error = 'Invalid payment amount';
            return response;
        }

        // Create order with Razorpay
        if (paymentSdk === PaymentSDK.Razorpay) {
            const createOrderResponse = await RazorpayPaymentService.createOrderWithRazorpayPaymentGateway(
                paymentTxn
            );

            if (createOrderResponse.success && createOrderResponse.razorpayOrder) {

                logger.debug('createOrderResponse', {
                    data: {createOrderResponse}
                });
                const createUPIPaymentWithRazorpayPaymentGatewayResponse = await RazorpayPaymentService.createUPIPaymentWithRazorpayPaymentGateway({
                    createOrderResponse,
                    paymentTxn,
                    customerInfo: { email: buyerDetails?.email ?? 'info@pulseenergy.io', contact: buyerDetails?.phone ?? '9876543210' },
                });

                if (createUPIPaymentWithRazorpayPaymentGatewayResponse.success) {
                    return createUPIPaymentWithRazorpayPaymentGatewayResponse;
                }

                logger.error('Failed to create Razorpay UPI payment', undefined, {
                    paymentTxn,
                    createUPIPaymentWithRazorpayPaymentGatewayResponse
                });
                response.success = true;
                response.orderId = createOrderResponse.razorpayOrder.id;
                response.razorpay = createOrderResponse.razorpayObject;
                return response;
            }

            logger.error('Failed to create Razorpay order', undefined, {
                paymentTxn,
                createOrderResponse
            });
            response.error = createOrderResponse.error || 'Failed to create Razorpay order';
            return response;
        }

        logger.error('Invalid payment sdk', undefined, { paymentTxn, paymentSdk });
        response.error = 'Invalid payment sdk';
        return response;
    }

    /**
     * Process a refund for a payment transaction
     *
     * @param payload - Refund request payload
     * @returns Refund response with refund ID and status
     */
    public static async processRefund(payload: RefundRequestPayload): Promise<RefundResponsePayload> {
        try {
            const { payment_txn_id, refund_amount } = payload;

            // Get the payment transaction
            const paymentTxn = await PaymentTxnDbService.getById(payment_txn_id);

            if (!paymentTxn) {
                logger.error('Refund: Payment transaction not found', undefined, { payment_txn_id });
                return {
                    success: false,
                    error: `Payment transaction not found: ${payment_txn_id}`,
                };
            }

            // Validate payment status - can only refund successful payments
            // Accept both GenericPaymentTxnStatus.Success ('SUCCESS') and BecknPaymentStatus.COMPLETED ('COMPLETED')
            const successfulStatuses = [GenericPaymentTxnStatus.Success, 'SUCCESS', 'COMPLETED'];
            if (!successfulStatuses.includes(paymentTxn.status as string)) {
                logger.error('Refund: Payment is not in successful status', undefined, {
                    payment_txn_id,
                    status: paymentTxn.status
                });
                return {
                    success: false,
                    error: 'Can only refund successful payments',
                };
            }

            // Get payment gateway details
            const additionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
            const paymentSdk = additionalProps?.payment_sdk || PaymentSDK.Razorpay;

            // Process refund with Razorpay
            if (paymentSdk === PaymentSDK.Razorpay) {
                // Pass the DB payment_txn_id so createRefund can look up partner/gateway IDs internally
                const refundAmountInPaisa = Math.round(refund_amount * 100);

                const refundResult = await RazorpayPaymentService.processRefund(
                    payment_txn_id,
                    refundAmountInPaisa,
                );

                if (refundResult.success) {
                    logger.info('Refund: Successfully initiated', {
                        payment_txn_id,
                        refund_id: refundResult.refundId,
                        refund_status: refundResult.refundStatus,
                    });

                    return {
                        success: true,
                        refund_id: refundResult.refundId,
                        refund_status: refundResult.refundStatus,
                    };
                }

                logger.error('Refund: Failed to process', undefined, {
                    payment_txn_id,
                    error: refundResult.error
                });
                return {
                    success: false,
                    error: refundResult.error || 'Failed to process refund',
                };
            }

            logger.error('Refund: Invalid payment SDK', undefined, { payment_txn_id, paymentSdk });
            return {
                success: false,
                error: 'Invalid payment SDK for refund',
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Refund: Failed to process refund', err, { payload });
            return {
                success: false,
                error: err.message,
            };
        }
    }

    /**
     * Verify payment status by retrieving transaction from payment gateway
     *
     * @param paymentTxnId - Payment transaction ID
     * @returns Payment status and transaction details
     */
    public static async verifyPaymentStatus(paymentTxnId: string): Promise<VerifyPaymentResponsePayload> {
        try {
            // Get the payment transaction
            const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);

            if (!paymentTxn) {
                logger.error('Verify Payment: Payment transaction not found', undefined, { paymentTxnId });
                return {
                    success: false,
                    error: `Payment transaction not found: ${paymentTxnId}`,
                };
            }

            const partnerId = paymentTxn.partner_id;
            const additionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
            const paymentSdk = additionalProps?.payment_sdk || PaymentSDK.Razorpay;

            const orderId = paymentTxn.payment_gateway_order_id || paymentTxn.authorization_reference;

            if (!orderId) {
                logger.error('Verify Payment: Order ID not found', undefined, { paymentTxnId });
                return {
                    success: false,
                    error: 'Order ID not found',
                };
            }

            // Verify with Razorpay
            if (paymentSdk === PaymentSDK.Razorpay) {
                const result = await RazorpayPaymentService.verifyPayment(orderId, partnerId);

                if (result.success) {
                    logger.info('Verify Payment: Razorpay status retrieved successfully', {
                        paymentTxnId,
                        payment_status: result.status,
                    });

                    // Update payment txn status if changed
                    if (result.status && result.status !== paymentTxn.status) {
                        await PaymentTxnDbService.update(paymentTxn.id, {
                            status: result.status,
                            details: JSON.parse(JSON.stringify(result.paymentDetails || {})),
                        } as any);
                    }

                    return {
                        success: true,
                        payment_status: result.status,
                        transaction_details: result.paymentDetails,
                    };
                }

                logger.error('Verify Payment: Failed to retrieve Razorpay status', undefined, {
                    paymentTxnId,
                    error: result.error
                });
                return {
                    success: false,
                    error: result.error || 'Failed to verify payment status',
                };
            }

            logger.error('Verify Payment: Invalid payment SDK', undefined, { paymentTxnId, paymentSdk });
            return {
                success: false,
                error: 'Invalid payment SDK for verification',
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Verify Payment: Failed to verify', err, { paymentTxnId });
            return {
                success: false,
                error: err.message,
            };
        }
    }
}
