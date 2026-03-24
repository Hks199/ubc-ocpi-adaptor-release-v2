import { BecknDomain } from "../../../enums/BecknDomain";
import { BecknPaymentStatus } from "../../../enums/PaymentStatus";

export type ExtractedStatusRequestBody = {
    metadata: {
        domain: BecknDomain;
        bpp_id: string;
        bpp_uri: string;
        beckn_transaction_id: string;
        beckn_message_id: string;
        bap_id?: string;
        bap_uri?: string;
    };
    payload: {
        beckn_order_id: string;
        payment_status?: BecknPaymentStatus; // payment status (only if beneficiary is BAP)
        beneficiary: string; // beneficiary type (BAP or BPP)
    };
};

export type ExtractedOnStatusResponseBody = {
    metadata: {
        domain: BecknDomain;
    };
    payload: {
        success: boolean;
        paid_at?: string; // Only if beneficiary is BPP
        payment_status?: BecknPaymentStatus; // Only if beneficiary is BPP
    };
};

