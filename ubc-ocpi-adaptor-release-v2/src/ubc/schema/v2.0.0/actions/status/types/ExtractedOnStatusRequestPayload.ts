import { GenericPaymentTxnStatus } from "../../../../../../types/Payment";

export type ExtractedOnStatusRequestBody = {
    payment_status: string,
    authorization_reference: string,
    oldPaymentStatus: GenericPaymentTxnStatus,
    amount?: number,
};
