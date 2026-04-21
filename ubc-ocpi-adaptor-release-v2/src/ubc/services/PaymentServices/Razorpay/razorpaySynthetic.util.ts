import * as crypto from 'crypto';
import type {
    RazorpayCreateOrderRequest,
    RazorpayCreateOrderResponse,
    RazorpayCreateUPIPaymentResponse,
} from '../../../../types/Razorpay';

/**
 * When true, Razorpay order/UPI creation uses synthetic responses if DB + env have no keys.
 * When unset, development/test default to synthetic; production requires explicit opt-in.
 */
export function shouldUseSyntheticRazorpayWhenNoCredentials(): boolean {
    const explicit = process.env.RAZORPAY_SYNTHETIC_WITHOUT_CREDS?.trim().toLowerCase();
    if (explicit === 'true' || explicit === '1' || explicit === 'yes') {
        return true;
    }
    if (explicit === 'false' || explicit === '0' || explicit === 'no') {
        return false;
    }
    const n = process.env.NODE_ENV;
    return n === 'development' || n === 'test';
}

export function buildSyntheticOrderResponse(order: RazorpayCreateOrderRequest): RazorpayCreateOrderResponse {
    const id = `order_uat_${crypto.randomBytes(8).toString('hex')}`;
    return {
        id,
        entity: 'order',
        amount: order.amount,
        amount_paid: 0,
        amount_due: order.amount,
        currency: order.currency,
        receipt: order.receipt ?? null,
        offer_id: null,
        status: 'created',
        attempts: 0,
        notes: order.notes ?? {},
        created_at: Math.floor(Date.now() / 1000),
    };
}

export function buildSyntheticUpiPaymentResponse(
    orderId: string,
    amountPaise: number,
    notes?: Record<string, string>
): RazorpayCreateUPIPaymentResponse {
    const razorpay_payment_id = `pay_uat_${crypto.randomBytes(8).toString('hex')}`;
    const amt = (amountPaise / 100).toFixed(2);
    const rawRef = (notes?.authorization_reference || notes?.beckn_transaction_id || orderId || 'charge').toString();
    const tn = encodeURIComponent(rawRef.replace(/[^\w.-]/g, '').slice(0, 80) || 'charge');
    const link = `upi://pay?pa=success@razorpay&pn=UAT-Charging&am=${amt}&cu=INR&tn=${tn}`;
    return { razorpay_payment_id, link };
}
