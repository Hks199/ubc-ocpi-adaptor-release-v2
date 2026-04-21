import { BecknDomain } from "../../../enums/BecknDomain";
import { BecknOrderValueResponse } from "../../../types/OrderValue";

export type ExtractedOnSelectResponsePayload = {
    "beckn:orderValue": BecknOrderValueResponse;
    connector_type?: string;
    power_rating?: number;
    /** Minutes to deliver ordered kWh at max connector power (estimate) */
    duration_in_minutes?: number;
};

export type ExtractedOnSelectResponseBody = {
    metadata: {
        domain: BecknDomain,
    },
    payload: ExtractedOnSelectResponsePayload,
};
