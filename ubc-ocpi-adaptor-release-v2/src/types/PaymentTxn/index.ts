import { PaymentSDK } from "../Payment";
import { RazorpayCreateOrderResponse, RazorpayCreateUPIPaymentResponse } from "../Razorpay";

/**
 * Additional properties stored with a payment transaction
 */
export type PaymentTxnAdditionalProps = {
    /** When the payment was received */
    payment_received_at?: string;
    payment_sdk?: PaymentSDK;
    org_id?: string;
    order_id?: string;
    app_variant?: string;
    refund_amount?: string;
    payment_gateway_create_object?: RazorpayCreateOrderResponse;
    /** Razorpay UPI payment response (for intent/collect flows) */
    payment_gateway_upi_payment?: RazorpayCreateUPIPaymentResponse;
};
