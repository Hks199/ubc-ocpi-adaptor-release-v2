import {
    RazorpayCreateOrderResponse,
    RazorpayCreateUPIPaymentResponse,
    RazorpayOrderStatus,
} from '../../../../types/Razorpay';

/**
 * When RAZORPAY_MOCK is enabled, order/UPI creation skips the real Razorpay API
 * and returns synthetic IDs + a placeholder UPI intent link (no keys required).
 * Use only in UAT/dev — never enable in production with real money flows.
 */
export function isRazorpayMockMode(): boolean {
    const v = process.env.RAZORPAY_MOCK?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/**
 * When true, missing Razorpay keys (partner row + RAZORPAY_KEY_*) use a synthetic order/UPI (no API).
 * Explicit: RAZORPAY_FAKE_WITHOUT_CREDS=true|false.
 * Default: on for NODE_ENV=development|test unless RAZORPAY_FAKE_WITHOUT_CREDS=false.
 */
export function isRazorpayFakeWithoutCredentialsEnabled(): boolean {
    const v = process.env.RAZORPAY_FAKE_WITHOUT_CREDS?.trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'no') {
        return false;
    }
    if (v === '1' || v === 'true' || v === 'yes') {
        return true;
    }
    const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
    return nodeEnv === 'development' || nodeEnv === 'test';
}

function randomSuffix(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildMockRazorpayOrder(params: {
    amount: number;
    receipt: string;
    notes?: Record<string, string>;
}): RazorpayCreateOrderResponse {
    const id = `order_mock_${randomSuffix()}`;
    return {
        id,
        entity: 'order',
        amount: params.amount,
        amount_paid: 0,
        amount_due: params.amount,
        currency: 'INR',
        receipt: params.receipt,
        offer_id: null,
        status: RazorpayOrderStatus.Created,
        attempts: 0,
        notes: (params.notes || {}) as RazorpayCreateOrderResponse['notes'],
        created_at: Math.floor(Date.now() / 1000),
    };
}

export function buildMockUPIPaymentResponse(params: {
    orderId: string;
    amountPaisa: number;
}): RazorpayCreateUPIPaymentResponse {
    const razorpay_payment_id = `pay_mock_${randomSuffix()}`;
    const amountRupees = (params.amountPaisa / 100).toFixed(2);
    const customUrl = process.env.RAZORPAY_MOCK_PAYMENT_URL?.trim();
    const link =
        customUrl && customUrl.length > 0
            ? `${customUrl}${customUrl.includes('?') ? '&' : '?'}order_id=${encodeURIComponent(params.orderId)}&mock_pay=1`
            : `upi://pay?pa=mock.merchant@npci&pn=MOCK-UAT&am=${amountRupees}&cu=INR&tn=Mock-Razorpay&tr=${encodeURIComponent(params.orderId)}`;
    return {
        razorpay_payment_id,
        link,
    };
}
