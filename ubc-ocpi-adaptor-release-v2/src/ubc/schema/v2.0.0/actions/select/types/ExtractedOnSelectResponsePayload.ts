import { BecknDomain } from "../../../enums/BecknDomain";
import { BecknOrderValueResponse } from "../../../types/OrderValue";

export type ExtractedOnSelectResponsePayload = {
    "beckn:orderValue": BecknOrderValueResponse;
    connector_type?: string;
    power_rating?: number;
    // "beckn:price": BecknOfferPrice;
};

export type ExtractedOnSelectResponseBody = {
    metadata: {
        domain: BecknDomain,
    },
    payload: ExtractedOnSelectResponsePayload,
};
