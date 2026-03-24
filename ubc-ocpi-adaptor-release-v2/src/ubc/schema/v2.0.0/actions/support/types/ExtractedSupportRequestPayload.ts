import { BecknDomain } from "../../../enums/BecknDomain";

// v0.9: User support contact info from request
export type UserSupportInfo = {
    name?: string;
    phone?: string;
    email?: string;
    hours?: string;
    channels?: string[];
};

export type ExtractedSupportRequestPayload = {
    metadata: {
        domain: BecknDomain,
        bpp_id?: string,
        bpp_uri?: string,
        beckn_transaction_id?: string,
    },
    payload: {
        reference_id: string; // mapped from refId
        reference_type: string; // mapped from refType
        user_support_info?: UserSupportInfo; // v0.9: user's contact info
    },
};

