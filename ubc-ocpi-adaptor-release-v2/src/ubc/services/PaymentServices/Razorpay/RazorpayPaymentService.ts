/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Razorpay Payment Service
 * Handles webhook callbacks, order creation, and payment processing for Razorpay integration
 * Documentation: https://razorpay.com/docs/payments/payment-gateway/s2s-integration/
 */
import { PaymentTxn } from "@prisma/client";
import { logger } from "../../../../services/logger.service";
import PaymentTxnDbService from "../../../../db-services/PaymentTxnDbService";
import ResponsesService from "../../../../services/Responses.service";
import RazorpayPaymentGatewayService from "./index";
import {
    RazorpayCallbackPayload,
    RazorpayWebhookPayload,
    RazorpayWebhookEvent,
    RazorpayPaymentResponse,
    RazorpayCreateOrderResponse,
    RazorpayObject,
    RazorpayPaymentServiceProps,
    RazorpayUPIFlow,
    mapRazorpayStatusToGeneric,
    CreateOrderWithRazorpayResponse,
    CreateUPIPaymentWithRazorpayResponse,
    RazorpayPaymentStatus,
    RazorpayCreateUPIPaymentRequest,
} from "../../../../types/Razorpay";
import { GenericPaymentTxnStatus, PaymentSDK } from "../../../../types/Payment";
import { HttpResponse } from "../../../../types/responses";
import OnStatusActionHandler from "../../../actions/handlers/OnStatusActionHandler";
import { BecknPaymentStatus } from "../../../schema/v2.0.0/enums/PaymentStatus";
import { PaymentTxnAdditionalProps } from "../../../../types/PaymentTxn";
import Utils from "../../../../utils/Utils";
import { BecknOrderValueComponents } from "../../../schema/v2.0.0/types/OrderValue";
import { OrderValueComponentsType } from "../../../schema/v2.0.0/enums/OrderValueComponentsType";
import GenericPaymentService from "../Generic";
import { shouldUseSyntheticRazorpayWhenNoCredentials } from "./razorpaySynthetic.util";

// Helper function to extract error message
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
};

// Helper function to map GenericPaymentTxnStatus to BecknPaymentStatus
export const mapGenericToBecknStatus = (status: string): BecknPaymentStatus | null => {
    switch (status) {
        case GenericPaymentTxnStatus.Success:
            return BecknPaymentStatus.COMPLETED;
        case GenericPaymentTxnStatus.Failed:
            return BecknPaymentStatus.FAILED;
        case GenericPaymentTxnStatus.Pending:
            return BecknPaymentStatus.PENDING;
        case GenericPaymentTxnStatus.Refunded:
            return BecknPaymentStatus.REFUNDED;
        default:
            return null;
    }
};

export default class RazorpayPaymentService {
    /**
     * Handle Razorpay webhook callback
     * This method processes webhook notifications from Razorpay
     * 
     * Webhook events:
     * - payment.authorized: Payment authorized but not captured
     * - payment.captured: Payment captured successfully
     * - payment.failed: Payment failed
     * - refund.created: Refund initiated
     * - refund.processed: Refund completed
     * 
     * @param reqPayload - The webhook payload from Razorpay
     * @param signature - X-Razorpay-Signature header for verification
     * @param partnerId - Partner ID for credentials (optional, derived from payload if not provided)
     * @returns Response indicating success/failure
     */
    public static async razorpayWebhook(
        reqPayload: RazorpayWebhookPayload,
        signature?: string,
        partnerId?: string
    ): Promise<HttpResponse<any>> {
        try {
            logger.info('Razorpay Webhook Request Payload', { 
                event: reqPayload.event,
                contains: reqPayload.contains,
            });

            const event = reqPayload.event;
            const payment = reqPayload.payload?.payment?.entity;
            const order = reqPayload.payload?.order?.entity;

            // Get order_id from payment or order
            const orderId = payment?.order_id || order?.id;

            if (!orderId) {
                logger.warn('Razorpay Webhook: No order ID found in payload');
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            // Find payment txn by order ID
            const paymentTxn = await PaymentTxnDbService.getByOrderId(orderId);

            if (!paymentTxn) {
                logger.error('Razorpay Webhook: PaymentTxn not found', undefined, { orderId });
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            logger.info('Razorpay Webhook: PaymentTxn found', {
                paymentTxnId: paymentTxn.id,
                paymentTxnStatus: paymentTxn.status,
                event,
            });

            // Process based on event type
            if (event.startsWith('payment.')) {
                await this.handlePaymentEvent(paymentTxn, event, payment);
            }
            else if (event.startsWith('refund.')) {
                await this.handleRefundEvent(paymentTxn, event, reqPayload.payload?.refund?.entity);
            }

            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {},
            });
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Razorpay: Webhook processing failed', err, { reqPayload });

            // Always return success to Razorpay to prevent retries
            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {}
            });
        }
    }

    /**
     * Handle Razorpay callback (redirect after payment)
     * @param reqPayload - The callback payload from Razorpay
     * @returns Response indicating success/failure
     */
    public static async razorpayCallback(reqPayload: RazorpayCallbackPayload): Promise<HttpResponse<any>> {
        try {
            logger.info('Razorpay Callback Request Payload', { reqPayload });

            const { razorpay_payment_id, razorpay_order_id, razorpay_signature, error_code } = reqPayload;

            if (!razorpay_order_id) {
                logger.warn('Razorpay Callback: No order ID found');
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            // Find payment txn by order ID
            const paymentTxn = await PaymentTxnDbService.getByOrderId(razorpay_order_id);

            if (!paymentTxn) {
                logger.error('Razorpay Callback: PaymentTxn not found', undefined, { razorpay_order_id });
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            logger.info('Razorpay Callback: PaymentTxn found', {
                paymentTxnId: paymentTxn.id,
                paymentTxnStatus: paymentTxn.status,
            });

            // If there's an error, handle it
            if (error_code) {
                logger.info('Razorpay Callback: Payment failed', {
                    paymentTxnId: paymentTxn.id,
                    error_code,
                    error_description: reqPayload.error_description,
                });

                // Update status to failed
                await PaymentTxnDbService.update(paymentTxn.id, {
                    status: GenericPaymentTxnStatus.Failed,
                    details: JSON.parse(JSON.stringify({
                        error_code,
                        error_description: reqPayload.error_description,
                        error_source: reqPayload.error_source,
                        error_step: reqPayload.error_step,
                        error_reason: reqPayload.error_reason,
                    })),
                } as any);

                return ResponsesService.success({
                    success: true,
                    message: 'Payment failed',
                    data: {}
                });
            }

            // Verify signature if payment ID is present
            if (razorpay_payment_id && razorpay_signature) {
                const isValid = await RazorpayPaymentGatewayService.verifyPaymentSignatureWithPartner(
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
                    paymentTxn.partner_id
                );

                if (!isValid) {
                    logger.error('Razorpay Callback: Invalid signature', undefined, {
                        paymentTxnId: paymentTxn.id,
                        razorpay_order_id,
                        razorpay_payment_id,
                    });
                    return ResponsesService.success({
                        success: true,
                        message: 'Invalid signature',
                        data: {}
                    });
                }

                // Update payment txn with payment ID
                await PaymentTxnDbService.update(paymentTxn.id, {
                    payment_gateway_payment_id: razorpay_payment_id,
                } as any);
            }

            // Check actual payment status
            const oldPaymentStatus = paymentTxn.status;
            const statusResult = await this.getPaymentStatusOfRazorpayPayment(paymentTxn);

            logger.info('Razorpay Callback: Payment status updated', {
                paymentTxnId: paymentTxn.id,
                oldStatus: oldPaymentStatus,
                newStatus: statusResult.status,
            });

            // If payment status changed, forward to BPP ONIX
            if (statusResult.success && statusResult.status !== oldPaymentStatus) {
                const becknPaymentStatus = mapGenericToBecknStatus(statusResult.status);
                
                if (becknPaymentStatus) {
                    try {
                        logger.info('Razorpay Callback: Forwarding status to BPP ONIX', {
                            paymentTxnId: paymentTxn.id,
                            authorizationReference: paymentTxn.authorization_reference,
                            paymentStatus: becknPaymentStatus,
                        });

                        await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: becknPaymentStatus,
                            oldPaymentStatus: oldPaymentStatus as GenericPaymentTxnStatus,
                        });

                        logger.info('Razorpay Callback: Status forwarded to BPP ONIX successfully', {
                            paymentTxnId: paymentTxn.id,
                        });
                    }
                    catch (statusError: unknown) {
                        const err = statusError instanceof Error ? statusError : new Error(String(statusError));
                        logger.error('Razorpay Callback: Failed to forward status to BPP ONIX', err, {
                            paymentTxnId: paymentTxn.id,
                            authorizationReference: paymentTxn.authorization_reference,
                        });
                    }
                }
            }

            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {},
            });
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Razorpay: Callback processing failed', err, { reqPayload });

            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {}
            });
        }
    }

    // In-memory cache to track recently processed webhook events (prevents rapid duplicate processing)
    private static processedWebhookEvents: Map<string, number> = new Map();
    private static readonly WEBHOOK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    private static readonly WEBHOOK_CACHE_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
    private static webhookCacheCleanupInitialized = false;

    // In-memory locks for order processing (prevents concurrent processing of same order)
    private static orderProcessingLocks: Map<string, Promise<void>> = new Map();

    /**
     * Initialize webhook cache cleanup interval
     */
    private static initializeWebhookCacheCleanup(): void {
        if (this.webhookCacheCleanupInitialized) return;
        this.webhookCacheCleanupInitialized = true;

        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamp] of this.processedWebhookEvents.entries()) {
                if (now - timestamp > this.WEBHOOK_CACHE_TTL_MS) {
                    this.processedWebhookEvents.delete(key);
                }
            }
        }, this.WEBHOOK_CACHE_CLEANUP_INTERVAL_MS);
    }

    /**
     * Generate unique key for webhook event deduplication
     */
    private static getWebhookEventKey(event: string, orderId: string, paymentId?: string): string {
        return `${event}:${orderId}:${paymentId || 'no-payment'}`;
    }

    /**
     * Check if a webhook event has already been processed
     */
    private static isWebhookEventProcessed(eventKey: string): boolean {
        const timestamp = this.processedWebhookEvents.get(eventKey);
        if (!timestamp) return false;
        
        // Check if the cached entry is still valid
        if (Date.now() - timestamp > this.WEBHOOK_CACHE_TTL_MS) {
            this.processedWebhookEvents.delete(eventKey);
            return false;
        }
        return true;
    }

    /**
     * Mark a webhook event as processed
     */
    private static markWebhookEventProcessed(eventKey: string): void {
        this.processedWebhookEvents.set(eventKey, Date.now());
    }

    /**
     * Check if status transition is valid
     * Terminal states (Success, Failed, Refunded) should not transition to non-terminal states
     */
    private static isValidStatusTransition(currentStatus: string, newStatus: GenericPaymentTxnStatus): boolean {
        const terminalStates = [
            GenericPaymentTxnStatus.Success,
            GenericPaymentTxnStatus.Failed,
            GenericPaymentTxnStatus.Refunded,
        ];

        // If current status is Success, only allow transition to Refunded
        if (currentStatus === GenericPaymentTxnStatus.Success) {
            return newStatus === GenericPaymentTxnStatus.Refunded || newStatus === GenericPaymentTxnStatus.Success;
        }

        // If current status is Refunded, don't allow any transition (final state)
        if (currentStatus === GenericPaymentTxnStatus.Refunded) {
            return newStatus === GenericPaymentTxnStatus.Refunded;
        }

        // If current status is Failed, allow transition to Success (retry scenario) or stay Failed
        if (currentStatus === GenericPaymentTxnStatus.Failed) {
            return newStatus === GenericPaymentTxnStatus.Success || newStatus === GenericPaymentTxnStatus.Failed;
        }

        // For pending status, allow transition to any status
        return true;
    }

    /**
     * Acquire lock for order processing to prevent concurrent updates
     */
    private static async acquireOrderLock(orderId: string): Promise<() => void> {
        // Wait for any existing lock on this order
        const existingLock = this.orderProcessingLocks.get(orderId);
        if (existingLock) {
            await existingLock;
        }

        // Create a new lock
        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });

        this.orderProcessingLocks.set(orderId, lockPromise);

        // Return release function
        return () => {
            this.orderProcessingLocks.delete(orderId);
            releaseLock!();
        };
    }

    /**
     * Handle Razorpay webhook events
     * This method processes webhook notifications from Razorpay for events like order.paid, payment.captured, etc.
     * 
     * Features:
     * - Idempotency: Prevents duplicate processing of the same webhook event
     * - Race condition handling: Uses in-memory locks to prevent concurrent processing of the same order
     * - Status transition validation: Ensures only valid status transitions are allowed
     * 
     * @param webhookPayload - The webhook event payload from Razorpay
     * @returns Response indicating success/failure
     */
    public static async razorpayWebhookEvent(webhookPayload: RazorpayWebhookPayload): Promise<HttpResponse<any>> {
        // Initialize cache cleanup on first call
        this.initializeWebhookCacheCleanup();

        const { event, account_id, contains, payload, created_at } = webhookPayload;

        // Extract order and payment data from payload
        const orderEntity = payload?.order?.entity;
        const paymentEntity = payload?.payment?.entity;
        const refundEntity = payload?.refund?.entity;

        // Get order_id from order entity or payment entity
        const orderId = orderEntity?.id || paymentEntity?.order_id;

        if (!orderId) {
            logger.warn('Razorpay Webhook Event: No order ID found in payload', { event });
            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {}
            });
        }

        // Generate unique event key for deduplication
        const eventKey = this.getWebhookEventKey(event, orderId, paymentEntity?.id);

        // Check for duplicate webhook
        if (this.isWebhookEventProcessed(eventKey)) {
            logger.info('Razorpay Webhook Event: Duplicate event detected, skipping', {
                event,
                orderId,
                paymentId: paymentEntity?.id,
                eventKey,
            });
            return ResponsesService.success({
                success: true,
                message: 'success',
                data: { duplicate: true }
            });
        }

        // Acquire lock for this order to prevent race conditions
        const releaseLock = await this.acquireOrderLock(orderId);

        try {
            logger.info('Razorpay Webhook Event Processing', {
                event,
                accountId: account_id,
                contains,
                createdAt: created_at,
                orderId,
                eventKey,
            });

            // Find payment txn by order ID (fetch fresh to get latest status)
            const paymentTxn = await PaymentTxnDbService.getByOrderId(orderId);

            if (!paymentTxn) {
                logger.error('Razorpay Webhook Event: PaymentTxn not found', undefined, { orderId, event });
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: {}
                });
            }

            logger.info('Razorpay Webhook Event: PaymentTxn found', {
                paymentTxnId: paymentTxn.id,
                paymentTxnStatus: paymentTxn.status,
                event,
                orderId,
            });

            const oldPaymentStatus = paymentTxn.status;
            let newStatus: GenericPaymentTxnStatus = oldPaymentStatus as GenericPaymentTxnStatus;
            let updateData: Record<string, any> = {};

            // Process based on event type
            switch (event) {
                case RazorpayWebhookEvent.OrderPaid:
                    // Order is fully paid
                    newStatus = GenericPaymentTxnStatus.Success;
                    if (paymentEntity) {
                        updateData = {
                            status: newStatus,
                            payment_gateway_payment_id: paymentEntity.id,
                            details: JSON.parse(JSON.stringify({
                                order_status: orderEntity?.status,
                                payment_status: paymentEntity.status,
                                payment_method: paymentEntity.method,
                                vpa: paymentEntity.vpa,
                                upi_details: paymentEntity.upi,
                                acquirer_data: paymentEntity.acquirer_data,
                                fee: paymentEntity.fee,
                                tax: paymentEntity.tax,
                                amount: paymentEntity.amount,
                                amount_captured: paymentEntity.amount_captured,
                                captured: paymentEntity.captured,
                            })),
                        };
                    }
                    else {
                        updateData = {
                            status: newStatus,
                            details: JSON.parse(JSON.stringify({
                                order_status: orderEntity?.status,
                            })),
                        };
                    }
                    break;

                case RazorpayWebhookEvent.PaymentCaptured:
                    newStatus = GenericPaymentTxnStatus.Success;
                    if (paymentEntity) {
                        updateData = {
                            status: newStatus,
                            payment_gateway_payment_id: paymentEntity.id,
                            details: JSON.parse(JSON.stringify({
                                payment_status: paymentEntity.status,
                                payment_method: paymentEntity.method,
                                vpa: paymentEntity.vpa,
                                upi_details: paymentEntity.upi,
                                acquirer_data: paymentEntity.acquirer_data,
                                fee: paymentEntity.fee,
                                tax: paymentEntity.tax,
                                amount: paymentEntity.amount,
                                captured: paymentEntity.captured,
                            })),
                        };
                    }
                    break;

                case RazorpayWebhookEvent.PaymentAuthorized:
                    // Payment authorized but not captured yet - keep as pending
                    newStatus = GenericPaymentTxnStatus.Pending;
                    if (paymentEntity) {
                        updateData = {
                            payment_gateway_payment_id: paymentEntity.id,
                            details: JSON.parse(JSON.stringify({
                                payment_status: paymentEntity.status,
                                payment_method: paymentEntity.method,
                                vpa: paymentEntity.vpa,
                            })),
                        };
                    }
                    break;

                case RazorpayWebhookEvent.PaymentFailed:
                    newStatus = GenericPaymentTxnStatus.Failed;
                    if (paymentEntity) {
                        updateData = {
                            status: newStatus,
                            payment_gateway_payment_id: paymentEntity.id,
                            details: JSON.parse(JSON.stringify({
                                payment_status: paymentEntity.status,
                                error_code: paymentEntity.error_code,
                                error_description: paymentEntity.error_description,
                                error_source: paymentEntity.error_source,
                                error_step: paymentEntity.error_step,
                                error_reason: paymentEntity.error_reason,
                            })),
                        };
                    }
                    break;

                case RazorpayWebhookEvent.RefundCreated:
                case RazorpayWebhookEvent.RefundProcessed:
                    if (refundEntity) {
                        newStatus = GenericPaymentTxnStatus.Refunded;
                        updateData = {
                            status: newStatus,
                            details: JSON.parse(JSON.stringify({
                                refund_id: refundEntity.id,
                                refund_status: refundEntity.status,
                                refund_amount: refundEntity.amount,
                            })),
                        };
                    }
                    break;

                case RazorpayWebhookEvent.RefundFailed:
                    logger.warn('Razorpay Webhook Event: Refund failed', {
                        paymentTxnId: paymentTxn.id,
                        refundEntity,
                    });
                    // Don't change payment status for failed refund
                    break;

                default:
                    logger.info(`Razorpay Webhook Event: Unhandled event type: ${event}`);
                    // Mark as processed to avoid re-processing
                    this.markWebhookEventProcessed(eventKey);
                    return ResponsesService.success({
                        success: true,
                        message: 'success',
                        data: {}
                    });
            }

            // Validate status transition
            if (!this.isValidStatusTransition(oldPaymentStatus, newStatus)) {
                logger.warn('Razorpay Webhook Event: Invalid status transition, skipping update', {
                    paymentTxnId: paymentTxn.id,
                    oldStatus: oldPaymentStatus,
                    newStatus,
                    event,
                });
                // Mark as processed to avoid re-processing
                this.markWebhookEventProcessed(eventKey);
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: { skipped: true, reason: 'invalid_status_transition' }
                });
            }

            // Check if status already matches (idempotency at DB level)
            if (oldPaymentStatus === newStatus && updateData.status === newStatus) {
                logger.info('Razorpay Webhook Event: Status already up to date, skipping redundant update', {
                    paymentTxnId: paymentTxn.id,
                    status: oldPaymentStatus,
                    event,
                });
                // Still update non-status fields if present
                if (updateData.payment_gateway_payment_id && !paymentTxn.payment_gateway_payment_id) {
                    await PaymentTxnDbService.update(paymentTxn.id, {
                        payment_gateway_payment_id: updateData.payment_gateway_payment_id,
                    } as any);
                }
                // Mark as processed
                this.markWebhookEventProcessed(eventKey);
                return ResponsesService.success({
                    success: true,
                    message: 'success',
                    data: { already_processed: true }
                });
            }

            // Update payment txn if there are changes
            if (Object.keys(updateData).length > 0) {
                await PaymentTxnDbService.update(paymentTxn.id, updateData as any);
                logger.info('Razorpay Webhook Event: PaymentTxn updated', {
                    paymentTxnId: paymentTxn.id,
                    oldStatus: oldPaymentStatus,
                    newStatus,
                    event,
                });
            }

            // Mark as processed after successful update
            this.markWebhookEventProcessed(eventKey);

            // Forward status change to BPP ONIX if status changed
            if (newStatus !== oldPaymentStatus) {
                const becknPaymentStatus = mapGenericToBecknStatus(newStatus);

                if (becknPaymentStatus) {
                    try {
                        logger.info('Razorpay Webhook Event: Forwarding status to BPP ONIX', {
                            paymentTxnId: paymentTxn.id,
                            authorizationReference: paymentTxn.authorization_reference,
                            paymentStatus: becknPaymentStatus,
                            oldStatus: oldPaymentStatus,
                            newStatus,
                        });

                        await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                            authorization_reference: paymentTxn.authorization_reference,
                            payment_status: becknPaymentStatus,
                            oldPaymentStatus: oldPaymentStatus as GenericPaymentTxnStatus,
                        });

                        logger.info('Razorpay Webhook Event: Status forwarded to BPP ONIX successfully', {
                            paymentTxnId: paymentTxn.id,
                        });
                    }
                    catch (statusError: unknown) {
                        const err = statusError instanceof Error ? statusError : new Error(String(statusError));
                        logger.error('Razorpay Webhook Event: Failed to forward status to BPP ONIX', err, {
                            paymentTxnId: paymentTxn.id,
                            authorizationReference: paymentTxn.authorization_reference,
                        });
                    }
                }
            }

            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {},
            });
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Razorpay Webhook Event: Processing failed', err, { webhookPayload });

            // Always return success to Razorpay to prevent retries
            return ResponsesService.success({
                success: true,
                message: 'success',
                data: {}
            });
        }
        finally {
            // Always release the lock
            releaseLock();
        }
    }

    /**
     * Handle payment-related webhook events
     */
    private static async handlePaymentEvent(
        paymentTxn: PaymentTxn,
        event: string,
        payment?: RazorpayPaymentResponse
    ): Promise<void> {
        if (!payment) {
            logger.warn('Razorpay Webhook: No payment data in payload');
            return;
        }

        const oldPaymentStatus = paymentTxn.status;
        let newStatus = oldPaymentStatus;

        switch (event) {
            case 'payment.captured':
                newStatus = GenericPaymentTxnStatus.Success;
                break;
            case 'payment.failed':
                newStatus = GenericPaymentTxnStatus.Failed;
                break;
            case 'payment.authorized':
                // Keep as pending - not yet captured
                newStatus = GenericPaymentTxnStatus.Pending;
                break;
            default:
                logger.info(`Razorpay Webhook: Unhandled payment event: ${event}`);
                return;
        }

        // Update payment txn
        await PaymentTxnDbService.update(paymentTxn.id, {
            status: newStatus,
            payment_gateway_payment_id: payment.id,
            details: JSON.parse(JSON.stringify(payment)),
        } as any);

        logger.info('Razorpay Webhook: Payment status updated', {
            paymentTxnId: paymentTxn.id,
            event,
            oldStatus: oldPaymentStatus,
            newStatus,
        });

        // Forward to BPP if status changed
        if (newStatus !== oldPaymentStatus) {
            const becknPaymentStatus = mapGenericToBecknStatus(newStatus);
            if (becknPaymentStatus) {
                try {
                    await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                        authorization_reference: paymentTxn.authorization_reference,
                        payment_status: becknPaymentStatus,
                        oldPaymentStatus: oldPaymentStatus as GenericPaymentTxnStatus,
                    });
                }
                catch (err) {
                    logger.error('Razorpay Webhook: Failed to forward status', err instanceof Error ? err : new Error(String(err)));
                }
            }
        }
    }

    /**
     * Handle refund-related webhook events
     */
    private static async handleRefundEvent(
        paymentTxn: PaymentTxn,
        event: string,
        refund?: any
    ): Promise<void> {
        if (!refund) {
            logger.warn('Razorpay Webhook: No refund data in payload');
            return;
        }

        logger.info('Razorpay Webhook: Refund event received', {
            paymentTxnId: paymentTxn.id,
            event,
            refund_id: refund.id,
            refund_status: refund.status,
        });

        if (event === 'refund.processed') {
            // Update payment txn status to refunded
            const currentAmount = Number(paymentTxn.amount);
            const refundAmount = refund.amount / 100; // Convert from paise to rupees

            const newStatus = refundAmount >= currentAmount 
                ? GenericPaymentTxnStatus.Refunded 
                : GenericPaymentTxnStatus.PartiallyRefunded;

            await PaymentTxnDbService.update(paymentTxn.id, {
                status: newStatus,
            } as any);
        }
    }

    /**
     * Verify and process a payment by retrieving its status from Razorpay
     * @param orderId - The Razorpay Order ID
     * @param partnerId - The partner ID for credentials
     * @returns Payment status and details
     */
    public static async verifyPayment(
        orderId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        status?: GenericPaymentTxnStatus;
        paymentDetails?: RazorpayPaymentResponse;
        error?: string;
    }> {
        try {
            // Fetch payments for the order
            const result = await RazorpayPaymentGatewayService.fetchOrderPayments(orderId, partnerId);

            if (!result.success || !result.payments) {
                return {
                    success: false,
                    error: 'Failed to retrieve payments from Razorpay',
                };
            }

            // Get the latest payment
            const payments = result.payments.items;
            if (payments.length === 0) {
                return {
                    success: true,
                    status: GenericPaymentTxnStatus.Pending,
                };
            }

            // Get the most recent captured or failed payment
            const latestPayment = payments.find(p => p.status === 'captured') 
                || payments.find(p => p.status === 'failed')
                || payments[0];

            const status = mapRazorpayStatusToGeneric(latestPayment.status);

            return {
                success: true,
                status,
                paymentDetails: latestPayment,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`Razorpay: Failed to verify payment - ${errorMessage}`, err, { orderId, partnerId });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Process a refund for a payment
     * @param paymentId - The Razorpay Payment ID
     * @param refundAmount - The amount to refund (in paise)
     * @param partnerId - The partner ID for credentials
     * @returns Refund result
     */
    public static async processRefund(
        paymentId: string,
        refundAmount: number | undefined,
    ): Promise<{
        success: boolean;
        refundId?: string;
        refundStatus?: string;
        error?: string;
    }> {
        try {
            const result = await RazorpayPaymentGatewayService.createRefund(
                paymentId,
                { amount: refundAmount },
            );

            if (!result.success || !result.refund) {
                return {
                    success: false,
                    error: result.error || 'Failed to create refund with Razorpay',
                };
            }

            return {
                success: true,
                refundId: result.refund.id,
                refundStatus: result.refund.status,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`Razorpay: Failed to process refund - ${errorMessage}`, err, {
                paymentId,
                refundAmount,
            });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Check refund status
     * @param refundId - Razorpay Refund ID
     * @param partnerId - The partner ID for credentials
     * @returns Refund status details
     */
    public static async checkRefundStatus(
        refundId: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        refundStatus?: string;
        refundDetails?: any;
        error?: string;
    }> {
        try {
            const result = await RazorpayPaymentGatewayService.fetchRefund(refundId, partnerId);

            if (!result.success || !result.refund) {
                return {
                    success: false,
                    error: 'Failed to retrieve refund from Razorpay',
                };
            }

            return {
                success: true,
                refundStatus: result.refund.status,
                refundDetails: result.refund,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`Razorpay: Failed to check refund status - ${errorMessage}`, err, {
                refundId,
                partnerId,
            });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Get payment status of a Razorpay payment and update the payment txn
     */
    private static async getPaymentStatusOfRazorpayPayment(paymentTxn: PaymentTxn): Promise<{
        success: boolean;
        status: string;
        error?: string;
    }> {
        try {
            const paymentTxnAdditionalProps = paymentTxn.additional_props as PaymentTxnAdditionalProps;
            const paymentSDK = paymentTxnAdditionalProps?.payment_sdk;
            const paymentStatus = paymentTxn.status;

            if (!paymentSDK || paymentSDK !== PaymentSDK.Razorpay) {
                logger.error('Invalid payment sdk for razorpay payment', undefined, { paymentTxn });
                return {
                    success: false,
                    status: paymentStatus,
                    error: 'Invalid payment sdk for razorpay payment',
                };
            }

            const orderId = paymentTxn?.payment_gateway_order_id;
            const partnerId = paymentTxn.partner_id;

            if (!orderId || !partnerId) {
                logger.error('Missing orderId or partnerId for payment status check', undefined, { paymentTxn });
                return {
                    success: false,
                    status: paymentStatus,
                    error: 'Missing orderId or partnerId',
                };
            }

            // Fetch payments for order
            const paymentStatusResponse = await RazorpayPaymentGatewayService.fetchOrderPayments(orderId, partnerId);

            if (paymentStatusResponse.success && paymentStatusResponse.payments) {
                const payments = paymentStatusResponse.payments.items;
                
                if (payments.length > 0) {
                    // Get the latest captured or failed payment
                    const latestPayment = payments.find(p => p.status === 'captured') 
                        || payments.find(p => p.status === 'failed')
                        || payments[0];

                    let newStatus: string = paymentStatus;
                    if (latestPayment.status === RazorpayPaymentStatus.Captured) {
                        newStatus = GenericPaymentTxnStatus.Success;
                    }
                    else if (latestPayment.status === RazorpayPaymentStatus.Failed) {
                        newStatus = GenericPaymentTxnStatus.Failed;
                    }

                    await PaymentTxnDbService.update(paymentTxn.id, {
                        status: newStatus,
                        payment_gateway_payment_id: latestPayment.id,
                        details: JSON.parse(JSON.stringify(latestPayment)),
                    } as any);

                    return {
                        success: true,
                        status: newStatus,
                    };
                }
            }

            logger.error('Failed to get payment status of razorpay payment', undefined, { paymentTxn, paymentStatusResponse });

            return {
                success: false,
                status: paymentStatus,
                error: 'Failed to get payment status of razorpay payment',
            };
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(getErrorMessage(error));
            logger.error('Failed to get payment status of razorpay payment', err, { paymentTxnId: paymentTxn.id });

            return {
                success: false,
                status: paymentTxn.status,
                error: 'Failed to get payment status of razorpay payment',
            };
        }
    }

    /**
     * Create order with Razorpay Payment Gateway
     * @param paymentTxn - Payment transaction object
     * @param razorpayPaymentServiceProps - Razorpay payment service properties (optional)
     * @returns Created order details
     */
    public static async createOrderWithRazorpayPaymentGateway(
        paymentTxn: PaymentTxn,
        razorpayPaymentServiceProps?: RazorpayPaymentServiceProps
    ): Promise<CreateOrderWithRazorpayResponse> {
        try {
            const amount = paymentTxn.amount;
            const partnerId = paymentTxn.partner_id;
            const payment_breakdown = (paymentTxn.payment_breakdown as any).breakdown as BecknOrderValueComponents[];
            
            const feeAmount = payment_breakdown.find(component => component.type === OrderValueComponentsType.FEE && component.description === 'Payment processing fee')?.value || 0;
            const feeAmountInPaisa = Number(Math.round(feeAmount * 100).toFixed(0));
            const gstOnFeeAmountInPaisa = GenericPaymentService.calculateGSTOnAmount(feeAmountInPaisa);
            const totalProcessingFeeInPaisa = (feeAmountInPaisa + gstOnFeeAmountInPaisa);
            if (!partnerId) {
                logger.error('Razorpay: Partner ID not found in payment txn', undefined, { paymentTxn });
                return {
                    success: false,
                    error: 'Partner ID not found',
                };
            }

            // Check if an order was already created
            const existingProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const existingOrder = existingProps?.payment_gateway_create_object as RazorpayCreateOrderResponse | undefined;
            
            if (existingOrder && existingOrder.id && existingOrder.status !== 'paid') {
                logger.info('Razorpay: Returning existing order', { 
                    paymentTxnId: paymentTxn.id, 
                    order_id: existingOrder.id,
                    status: existingOrder.status,
                });

                const razorpayObject: RazorpayObject = {
                    order_id: existingOrder.id,
                    authorization_reference: paymentTxn.authorization_reference,
                };

                return {
                    success: true,
                    razorpayOrder: existingOrder,
                    razorpayObject: razorpayObject,
                };
            }

            // Convert Decimal to number (amount in paise)
            const amountInPaisa = Number(Math.round(Number(amount) * 100).toFixed(0)) - totalProcessingFeeInPaisa;

            // Generate receipt
            const receipt = 'rcpt_' + Utils.generateRandomString(10);

            const createOrderResponse = await RazorpayPaymentGatewayService.createOrder(
                {
                    amount: amountInPaisa,
                    currency: 'INR',
                    receipt: receipt,
                    notes: {
                        payment_txn_id: paymentTxn.id,
                        partner_id: partnerId,
                        authorization_reference: paymentTxn.authorization_reference || '',
                        beckn_transaction_id: paymentTxn.beckn_transaction_id || '',
                    },
                },
                partnerId
            );

            if (!createOrderResponse.success || !createOrderResponse.razorpay_order) {
                logger.error('Razorpay: Create order request failed', undefined, { paymentTxn, createOrderResponse });
                return {
                    success: false,
                    error: createOrderResponse.error || 'Create order request failed',
                    error_details: createOrderResponse.error_details,
                };
            }

            const razorpayOrder = createOrderResponse.razorpay_order;

            logger.info('Razorpay order created', { paymentTxnId: paymentTxn.id, razorpayOrderId: razorpayOrder.id });

            // Prepare additional props update
            const currentProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const updatedAdditionalProps = JSON.parse(JSON.stringify({
                ...(currentProps || {}),
                payment_sdk: PaymentSDK.Razorpay,
                payment_gateway_create_object: razorpayOrder,
            }));

            // Update payment txn with order details
            await PaymentTxnDbService.update(paymentTxn.id, {
                payment_gateway_order_id: razorpayOrder.id,
                status: GenericPaymentTxnStatus.Pending,
                additional_props: updatedAdditionalProps,
            } as any);

            const razorpayObject: RazorpayObject = {
                order_id: razorpayOrder.id,
                authorization_reference: paymentTxn.authorization_reference || paymentTxn.id,
            };

            return {
                success: true,
                razorpayOrder: razorpayOrder,
                razorpayObject: razorpayObject,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`Razorpay: Failed to create order - ${errorMessage}`, err, { paymentTxnId: paymentTxn.id });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Create UPI payment with Razorpay Payment Gateway (Intent or Collect)
     * @param paymentTxn - Payment transaction object
     * @param upiOptions - UPI specific options (flow, vpa, expiry_time)
     * @param customerInfo - Customer info (email, contact)
     * @returns Created payment details with intent link (for intent flow)
     */
    public static async createUPIPaymentWithRazorpayPaymentGateway(params: {
            createOrderResponse: CreateOrderWithRazorpayResponse,
            paymentTxn: PaymentTxn,
            upiOptions?: {
                flow: RazorpayUPIFlow | string;
                vpa?: string;
                expiry_time?: number;
            },
            customerInfo?: {
                email: string;
                contact: string;
            },
            deviceInfo?: {
                ip?: string;
                user_agent?: string;
                referer?: string;
            }
        }
    ): Promise<CreateUPIPaymentWithRazorpayResponse> {
        const { createOrderResponse, paymentTxn, upiOptions, customerInfo, deviceInfo } = params;
        try {
            const partnerId = paymentTxn.partner_id;

            if (!partnerId) {
                logger.error('Razorpay: Partner ID not found in payment txn', undefined, { paymentTxn });
                return {
                    success: false,
                    error: 'Partner ID not found',
                };
            }

            const deviceProps = {
                ip: deviceInfo?.ip || '127.0.0.1',
                user_agent: deviceInfo?.user_agent|| 'Mozilla/5.0',
                referer: deviceInfo || 'https://pulseenergy.io/',
            };

            const emailObject: RazorpayCreateUPIPaymentRequest['email'] = customerInfo?.email ?? 'info@pulseenergy.io';
            const contactObject: RazorpayCreateUPIPaymentRequest['contact'] = customerInfo?.contact ?? '9876543210';

            // Get order ID from additional props
            const existingOrder = createOrderResponse.razorpayOrder;
            
            if (!existingOrder || !existingOrder.id) {
                logger.error('Razorpay: No order found. Create an order first.', undefined, { createOrderResponse });
                return {
                    success: false,
                    error: 'No Razorpay order found. Create an order first.',
                };
            }

            const orderId = existingOrder.id;
            const amountInPaisa = existingOrder.amount;

            // Validate VPA for collect flow
            if (upiOptions?.flow === RazorpayUPIFlow.Collect && !upiOptions?.vpa) {
                return {
                    success: false,
                    error: 'VPA is required for collect flow',
                };
            }

            const upiOptionsObject: RazorpayCreateUPIPaymentRequest['upi'] = {
                flow: upiOptions?.flow ?? RazorpayUPIFlow.Intent,
            }
            
            if(upiOptions?.flow === RazorpayUPIFlow.Collect) {
                upiOptionsObject.flow = RazorpayUPIFlow.Collect;
                upiOptionsObject.vpa = upiOptions.vpa || '';
                upiOptionsObject.expiry_time = upiOptions.expiry_time || 5;
            }

            const razorpayCredentials = await RazorpayPaymentGatewayService.getCredentials(partnerId);
            if (!razorpayCredentials && !shouldUseSyntheticRazorpayWhenNoCredentials()) {
                throw new Error('Razorpay credentials not found for partner');
            }
            const feePercentage = razorpayCredentials?.credentials.fee_percentage ?? 0.2;


            // const feeAmount = Math.ceil(feePercentage * amountInPaisa / 100) + 2 * Math.round(9 * Math.ceil(feePercentage * amountInPaisa / 100) / 100);
            const { feeAmount: feeAmountWithOutGST, gstOnFeeAmount } = RazorpayPaymentGatewayService.upiIntentFee(amountInPaisa, feePercentage);
            const feeAmount = feeAmountWithOutGST + gstOnFeeAmount;
            const createPaymentResponse = await RazorpayPaymentGatewayService.createUPIPayment(
                {
                    amount: amountInPaisa + feeAmount,
                    currency: 'INR',
                    order_id: orderId,
                    email: emailObject,
                    contact: contactObject,
                    method: 'upi',
                    upi: upiOptionsObject,
                    ip: deviceProps?.ip,
                    user_agent: deviceProps?.user_agent,
                    referer: deviceProps.referer as string,
                    description: `Payment for ${paymentTxn.authorization_reference || paymentTxn.id}`,
                    notes: {
                        payment_txn_id: paymentTxn.id,
                        authorization_reference: paymentTxn.authorization_reference || '',
                    },
                    fee: feeAmount, // Pass calculated fee for CFB
                },
                partnerId
            );

            if (!createPaymentResponse.success || !createPaymentResponse.payment) {
                logger.error('Razorpay: Create UPI payment request failed', undefined, { paymentTxn, createPaymentResponse });
                return {
                    success: false,
                    error: createPaymentResponse.error || 'Create UPI payment request failed',
                    error_details: createPaymentResponse.error_details,
                };
            }

            const razorpayPayment = createPaymentResponse.payment;

            logger.info('Razorpay UPI payment created', { 
                paymentTxnId: paymentTxn.id, 
                razorpayPaymentId: razorpayPayment.razorpay_payment_id,
                hasIntentLink: !!razorpayPayment.link,
            });

            // Update payment txn with payment details
            const currentProps = paymentTxn.additional_props as Record<string, unknown> | null;
            const updatedAdditionalProps = JSON.parse(JSON.stringify({
                ...(currentProps || {}),
                payment_sdk: PaymentSDK.Razorpay,
                payment_gateway_upi_payment: razorpayPayment,
            }));

            await PaymentTxnDbService.update(paymentTxn.id, {
                payment_gateway_payment_id: razorpayPayment.razorpay_payment_id,
                additional_props: updatedAdditionalProps,
            } as any);

            const razorpayObject: RazorpayObject = {
                order_id: orderId,
                payment_id: razorpayPayment.razorpay_payment_id,
                intent_link: razorpayPayment.link,
                payment_url: razorpayPayment.link,
                authorization_reference: paymentTxn.authorization_reference || paymentTxn.id,
            };

            return {
                success: true,
                payment: razorpayPayment,
                razorpayObject: razorpayObject,
            };
        }
        catch (error: unknown) {
            const errorMessage = getErrorMessage(error);
            const err = error instanceof Error ? error : new Error(errorMessage);
            logger.error(`Razorpay: Failed to create UPI payment - ${errorMessage}`, err, { paymentTxnId: paymentTxn.id });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * Generate redirect HTML page after payment
     * Shows a styled page with payment status
     */
    public static generateRedirectPage(params: {
        message: string;
        isError?: boolean;
        errorCode?: string;
        errorDescription?: string;
        orderId?: string;
        paymentId?: string;
    }): string {
        const { message, isError, errorCode, errorDescription, orderId, paymentId } = params;
        
        // Icon based on status
        const iconColor = isError ? '#ef4444' : '#667eea';
        const iconPath = isError 
            ? 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' // X mark
            : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; // Checkmark

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${message}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 100%;
        }
        .icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 24px;
        }
        .icon svg {
            width: 100%;
            height: 100%;
            stroke: ${iconColor};
            stroke-width: 1.5;
            fill: none;
        }
        h1 {
            color: #1f2937;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        .subtitle {
            color: #6b7280;
            font-size: 16px;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .details {
            background: #f9fafb;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 24px;
            text-align: left;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            color: #6b7280;
            font-size: 14px;
        }
        .detail-value {
            color: #1f2937;
            font-size: 14px;
            font-weight: 500;
        }
        .close-hint {
            color: #6b7280;
            font-size: 14px;
            margin-top: 12px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" d="${iconPath}"/>
            </svg>
        </div>
        
        <h1>${message}</h1>
        <p class="subtitle">
            Please go back to the app to check your payment status.
        </p>
        
        ${(errorCode || errorDescription || orderId || paymentId) ? `
        <div class="details">
            ${errorCode ? `
            <div class="detail-row">
                <span class="detail-label">Error Code</span>
                <span class="detail-value">${errorCode}</span>
            </div>
            ` : ''}
            ${errorDescription ? `
            <div class="detail-row">
                <span class="detail-label">Error</span>
                <span class="detail-value">${errorDescription}</span>
            </div>
            ` : ''}
            ${orderId ? `
            <div class="detail-row">
                <span class="detail-label">Order ID</span>
                <span class="detail-value">${orderId}</span>
            </div>
            ` : ''}
            ${paymentId ? `
            <div class="detail-row">
                <span class="detail-label">Payment ID</span>
                <span class="detail-value">${paymentId}</span>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        <p class="close-hint">You may close this page</p>
    </div>
</body>
</html>
        `.trim();
    }
}
