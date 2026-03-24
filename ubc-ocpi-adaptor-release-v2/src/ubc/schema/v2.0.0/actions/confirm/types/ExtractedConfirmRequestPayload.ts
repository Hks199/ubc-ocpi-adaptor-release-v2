import { BecknRequestMetadata } from "../../select/types/ExtractedSelectRequestBody";

export type ExtractedConfirmRequestPayload = {
    beckn_order_id: string,
};

export type ExtractedConfirmRequestBody = {
    metadata: BecknRequestMetadata
    payload: ExtractedConfirmRequestPayload,
}
