import { Router, Request, Response } from 'express';
import { RazorpayCallbackPayload, RazorpayWebhookPayload, RazorpayCredentials, RazorpayUPIFlow } from '../../types/Razorpay';
import RazorpayPaymentService from '../../ubc/services/PaymentServices/Razorpay/RazorpayPaymentService';
import RazorpayPaymentGatewayService from '../../ubc/services/PaymentServices/Razorpay/index';
import RazorpayInitializerService from '../../ubc/services/PaymentServices/Razorpay/RazorpayInitializerService';
import PaymentTxnDbService from '../../db-services/PaymentTxnDbService';
import OCPIPartnerDbService from '../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps } from '../../types/OCPIPartner';
import { logger } from '../../services/logger.service';

const router = Router();

// ============================================
// RAZORPAY ROUTES
// ============================================

/**
 * Razorpay Webhook Endpoint
 * Handles server-to-server webhook notifications from Razorpay
 * Events: payment.authorized, payment.captured, payment.failed, refund.created, refund.processed
 */
router.post('/webhook/razorpay', async (req: Request, res: Response) => {
    try {
        const webhookPayload = req.body as RazorpayWebhookPayload;
        const signature = req.headers['x-razorpay-signature'] as string;
        
        logger.info('Razorpay webhook received', {
            event: webhookPayload.event,
            hasSignature: !!signature,
        });

        const response = await RazorpayPaymentService.razorpayWebhook(webhookPayload, signature);

        res.status(response.httpStatus || 200).json(response.payload);
    }
    catch (error) {
        logger.error('Razorpay webhook error', error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            success: false,
            message: 'Webhook processing failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Razorpay Callback Endpoint (POST)
 * Handles customer redirect after payment completion
 */
router.post('/external/payment/events', async (req: Request, res: Response) => {
    try {
        const webhookPayload = req.body as RazorpayWebhookPayload;
        
        logger.info('Razorpay webhook event received', {
            event: webhookPayload.event,
            accountId: webhookPayload.account_id,
            contains: webhookPayload.contains,
            hasPayment: !!webhookPayload.payload?.payment,
            hasOrder: !!webhookPayload.payload?.order,
            webhookPayload: JSON.stringify(webhookPayload),
        });

        const response = await RazorpayPaymentService.razorpayWebhookEvent(webhookPayload);

        res.status(response.httpStatus || 200).json(response.payload);
    }
    catch (error) {
        logger.error('Razorpay webhook event error', error instanceof Error ? error : new Error(String(error)));
        res.status(500).json({
            success: false,
            message: 'Webhook event processing failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Razorpay Redirect Callback Endpoint (GET)
 * Some flows redirect via GET with query parameters
 */
router.get('/callback/razorpay', async (req: Request, res: Response) => {
    try {
        const callbackPayload: RazorpayCallbackPayload = {
            razorpay_payment_id: req.query.razorpay_payment_id as string,
            razorpay_order_id: req.query.razorpay_order_id as string,
            razorpay_signature: req.query.razorpay_signature as string,
            error_code: req.query.error_code as string,
            error_description: req.query.error_description as string,
            error_source: req.query.error_source as string,
            error_step: req.query.error_step as string,
            error_reason: req.query.error_reason as string,
        };
        
        const response = await RazorpayPaymentService.razorpayCallback(callbackPayload);

        res.status(response.httpStatus || 200).json(response.payload);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Callback processing failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Razorpay Redirect Page (POST)
 * Shows a redirect page after payment completion
 */
router.post('/redirect/razorpay', async (req: Request, res: Response) => {
    try {
        const { 
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            error_code,
            error_description,
        } = req.body;
        
        logger.info('Razorpay redirect received', {
            hasPaymentId: !!razorpay_payment_id,
            hasOrderId: !!razorpay_order_id,
            hasError: !!error_code,
        });
        
        // Determine if it's an error or success
        const isError = !!error_code;
        
        // Generate display message
        let displayMessage: string;
        if (isError) {
            displayMessage = error_description || 'Payment could not be completed';
        }
        else {
            displayMessage = 'Payment Complete';
        }

        // Process the callback
        const callbackPayload: RazorpayCallbackPayload = {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            error_code,
            error_description,
        };
        await RazorpayPaymentService.razorpayCallback(callbackPayload);
        
        const html = RazorpayPaymentService.generateRedirectPage({
            message: displayMessage,
            isError,
            errorCode: error_code,
            errorDescription: error_description,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
        });

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    }
    catch (error) {
        logger.error('Razorpay redirect error', error instanceof Error ? error : new Error(String(error)));
        
        const html = RazorpayPaymentService.generateRedirectPage({
            message: 'Something went wrong',
            isError: true,
        });
        
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);
    }
});

/**
 * Check Razorpay Payment Status
 * GET /api/app/check-payment-status/razorpay/:paymentTxnId
 */
router.get('/check-payment-status/razorpay/:paymentTxnId', async (req: Request, res: Response) => {
    try {
        const paymentTxn = await PaymentTxnDbService.getById(req.params.paymentTxnId);

        if (!paymentTxn) {
            res.status(404).json({
                success: false,
                message: 'Payment transaction not found',
            });
            return;
        }

        const orderId = paymentTxn?.payment_gateway_order_id ?? '';
        const partnerId = paymentTxn?.partner_id ?? '';

        const result = await RazorpayPaymentService.verifyPayment(orderId, partnerId);

        res.status(200).json({
            success: result.success,
            status: result.status,
            payment_details: result.paymentDetails,
            error: result.error,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Status check failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Configure Razorpay credentials for a partner
 * POST /api/app/razorpay/configure/:partnerId
 */
router.post('/razorpay/configure/:partnerId', async (req: Request, res: Response) => {
    try {
        const { partnerId } = req.params;
        const credentials: RazorpayCredentials = req.body;

        if (!partnerId) {
            res.status(400).json({ success: false, error: 'Missing partnerId' });
            return;
        }

        // Get existing partner
        const partner = await OCPIPartnerDbService.getById(partnerId);
        if (!partner) {
            res.status(404).json({ success: false, error: 'Partner not found' });
            return;
        }

        // Update additional_props with Razorpay credentials
        const existingProps = partner.additional_props as OCPIPartnerAdditionalProps || {};
        const updatedProps: OCPIPartnerAdditionalProps = {
            ...existingProps,
            payment_services: {
                ...existingProps.payment_services,
                Razorpay: {
                    KEY_ID: credentials.KEY_ID,
                    KEY_SECRET: credentials.KEY_SECRET,
                    API_URL: credentials.API_URL,
                    WEBHOOK_SECRET: credentials.WEBHOOK_SECRET,
                },
            },
        };

        await OCPIPartnerDbService.update(partnerId, {
            additional_props: updatedProps as any,
        });

        // Clear credentials cache
        RazorpayInitializerService.clearCache(partnerId);

        res.status(200).json({
            success: true,
            message: 'Razorpay credentials updated successfully',
            partnerId,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Create Razorpay Order from existing PaymentTxn
 * POST /api/app/razorpay/create-order/:paymentTxnId
 */
router.post('/razorpay/create-order/:paymentTxnId', async (req: Request, res: Response) => {
    try {
        const { paymentTxnId } = req.params;

        if (!paymentTxnId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameter: paymentTxnId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Fetch PaymentTxn from DB
        const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);

        if (!paymentTxn) {
            res.status(404).json({
                success: false,
                message: 'PaymentTxn not found',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!paymentTxn.partner_id) {
            res.status(400).json({
                success: false,
                message: 'PaymentTxn does not have a partner_id',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Create order with Razorpay
        const result = await RazorpayPaymentService.createOrderWithRazorpayPaymentGateway(paymentTxn);

        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'Razorpay order created successfully',
                data: {
                    paymentTxnId: paymentTxn.id,
                    orderId: result.razorpayOrder?.id,
                    amount: result.razorpayOrder?.amount,
                    currency: result.razorpayOrder?.currency,
                    status: result.razorpayOrder?.status,
                    authorizationReference: result.razorpayObject?.authorization_reference,
                    razorpayOrder: result.razorpayOrder,
                    razorpayObject: result.razorpayObject,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'Create order request failed',
                error: result.error,
                error_details: result.error_details,
                paymentTxnId: paymentTxn.id,
                partnerId: paymentTxn.partner_id,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Razorpay order creation failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Create Razorpay UPI Payment (Intent or Collect)
 * POST /api/app/razorpay/create-upi-payment/:paymentTxnId
 * 
 * Body:
 * {
 *   "flow": "intent" | "collect",
 *   "vpa": "user@upi" (required for collect flow),
 *   "expiry_time": 5 (minutes, optional, for collect flow),
 *   "email": "customer@email.com",
 *   "contact": "9876543210",
 *   "device": {
 *     "ip": "...",
 *     "user_agent": "...",
 *     "referer": "..."
 *   }
 * }
 */
router.post('/razorpay/create-upi-payment/:paymentTxnId', async (req: Request, res: Response) => {
    try {
        const { paymentTxnId } = req.params;
        const { flow, vpa, expiry_time, email, contact, device } = req.body;

        if (!paymentTxnId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameter: paymentTxnId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!flow) {
            res.status(400).json({
                success: false,
                message: 'Missing required field: flow (intent or collect)',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!email || !contact) {
            res.status(400).json({
                success: false,
                message: 'Missing required fields: email and contact',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (flow === 'collect' && !vpa) {
            res.status(400).json({
                success: false,
                message: 'VPA is required for collect flow',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Fetch PaymentTxn from DB
        const paymentTxn = await PaymentTxnDbService.getById(paymentTxnId);

        if (!paymentTxn) {
            res.status(404).json({
                success: false,
                message: 'PaymentTxn not found',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        if (!paymentTxn.partner_id) {
            res.status(400).json({
                success: false,
                message: 'PaymentTxn does not have a partner_id',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Build device props
        const deviceProps = {
            ip: device?.ip || req.ip || '127.0.0.1',
            user_agent: device?.user_agent || req.get('user-agent') || 'Mozilla/5.0',
            referer: device?.referer || req.get('referer'),
        };

        // Create UPI payment with Razorpay
        const result = await RazorpayPaymentService.createUPIPaymentWithRazorpayPaymentGateway({
            createOrderResponse: {} as any,
            paymentTxn,
            upiOptions: {
                flow: flow as RazorpayUPIFlow,
                vpa,
                expiry_time,
            },
            customerInfo: { email, contact },
            deviceInfo: deviceProps,
        } as any);

        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'Razorpay UPI payment created successfully',
                data: {
                    paymentTxnId: paymentTxn.id,
                    paymentId: result.payment?.razorpay_payment_id,
                    intentLink: result.payment?.link,
                    orderId: result.razorpayObject?.order_id,
                    razorpayPayment: result.payment,
                    razorpayObject: result.razorpayObject,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'Create UPI payment request failed',
                error: result.error,
                error_details: result.error_details,
                paymentTxnId: paymentTxn.id,
                partnerId: paymentTxn.partner_id,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Razorpay UPI payment creation failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Validate VPA
 * POST /api/app/razorpay/validate-vpa/:partnerId
 * 
 * Body:
 * {
 *   "vpa": "user@upi"
 * }
 */
router.post('/razorpay/validate-vpa/:partnerId', async (req: Request, res: Response) => {
    try {
        const { partnerId } = req.params;
        const { vpa } = req.body;

        if (!partnerId || !vpa) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameters: partnerId and vpa',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const result = await RazorpayPaymentGatewayService.validateVPA(vpa, partnerId);

        if (result.success && result.validation) {
            res.status(200).json({
                success: true,
                message: 'VPA validated successfully',
                data: {
                    vpa: result.validation.vpa,
                    isValid: result.validation.success,
                    customerName: result.validation.customer_name,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'VPA validation failed',
                error: result.error,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'VPA validation failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Fetch Order Payments
 * GET /api/app/razorpay/order/:orderId/payments/:partnerId
 */
router.get('/razorpay/order/:orderId/payments/:partnerId', async (req: Request, res: Response) => {
    try {
        const { orderId, partnerId } = req.params;

        if (!orderId || !partnerId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameters: orderId and partnerId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const result = await RazorpayPaymentGatewayService.fetchOrderPayments(orderId, partnerId);

        if (result.success && result.payments) {
            res.status(200).json({
                success: true,
                message: 'Order payments fetched successfully',
                data: {
                    count: result.payments.count,
                    payments: result.payments.items,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'Failed to fetch order payments',
                error: result.error,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch order payments',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Create Refund
 * POST /api/app/razorpay/refund/:paymentId/:partnerId
 * 
 * Body:
 * {
 *   "amount": 10000 (in paise, optional - full refund if not provided),
 *   "speed": "normal" | "optimum" (optional),
 *   "receipt": "receipt_123" (optional),
 *   "notes": { "key": "value" } (optional)
 * }
 */
router.post('/razorpay/refund/:paymentId', async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;
        const { amount, speed, receipt, notes } = req.body;

        if (!paymentId ) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameters: paymentId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const result = await RazorpayPaymentGatewayService.createRefund(
            paymentId,
            { amount, speed, receipt, notes },
        );

        if (result.success && result.refund) {
            res.status(200).json({
                success: true,
                message: 'Refund created successfully',
                data: {
                    refundId: result.refund.id,
                    amount: result.refund.amount,
                    status: result.refund.status,
                    refund: result.refund,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: result.error || 'Failed to create refund',
                error: result.error,
                error_details: result.error_details,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create refund',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Fetch Refund Status
 * GET /api/app/razorpay/refund/:refundId/:partnerId
 */
router.get('/razorpay/refund/:refundId/:partnerId', async (req: Request, res: Response) => {
    try {
        const { refundId, partnerId } = req.params;

        if (!refundId || !partnerId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameters: refundId and partnerId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const result = await RazorpayPaymentGatewayService.fetchRefund(refundId, partnerId);

        if (result.success && result.refund) {
            res.status(200).json({
                success: true,
                message: 'Refund fetched successfully',
                data: {
                    refundId: result.refund.id,
                    amount: result.refund.amount,
                    status: result.refund.status,
                    refund: result.refund,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(404).json({
                success: false,
                message: result.error || 'Refund not found',
                error: result.error,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch refund',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Fetch Payment Details
 * GET /api/app/razorpay/payment/:paymentId/:partnerId
 */
router.get('/razorpay/payment/:paymentId/:partnerId', async (req: Request, res: Response) => {
    try {
        const { paymentId, partnerId } = req.params;

        if (!paymentId || !partnerId) {
            res.status(400).json({
                success: false,
                message: 'Missing required parameters: paymentId and partnerId',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        const result = await RazorpayPaymentGatewayService.fetchPayment(paymentId, partnerId);

        if (result.success && result.payment) {
            res.status(200).json({
                success: true,
                message: 'Payment fetched successfully',
                data: {
                    paymentId: result.payment.id,
                    orderId: result.payment.order_id,
                    amount: result.payment.amount,
                    status: result.payment.status,
                    method: result.payment.method,
                    vpa: result.payment.vpa,
                    payment: result.payment,
                },
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(404).json({
                success: false,
                message: result.error || 'Payment not found',
                error: result.error,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch payment',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});


export default router;
