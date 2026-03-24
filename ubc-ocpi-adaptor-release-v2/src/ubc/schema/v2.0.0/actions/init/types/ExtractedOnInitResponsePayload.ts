import { BecknDomain } from "../../../enums/BecknDomain";
import { BecknPaymentStatus } from "../../../enums/PaymentStatus";

export type ExtractedOnInitResponsePayload = {
    becknPaymentId: string,
    amount: number,
    paymentLink: string,
    chargeTxnRef: string,
    beneficiary?: string,
    paymentStatus: BecknPaymentStatus,
    becknOrderId: string,
};

export type ExtractedOnInitResponseBody = {
    metadata: {
        domain: BecknDomain,
    },
    payload: ExtractedOnInitResponsePayload,
};


export type GeneratePaymentLinkResponsePayload = {
    payment_link: string,
    authorization_reference: string,
};