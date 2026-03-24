import { Context } from "../../../types/Context";

// v0.9: Support info submitted by user in request
export type SupportRequestInfo = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld"
    "@type": string; // "beckn:SupportInfo"
    name?: string;
    phone?: string;
    email?: string;
    hours?: string;
    channels?: string[];
};

// v0.9: Support request payload - changed ref_id/ref_type to refId/refType (camelCase)
// v0.9: Added support object with user's contact info
export type UBCSupportRequestPayload = {
    context: Context,
    message: {
        refId: string; // v0.9: renamed from ref_id (e.g. "order-ev-charging-001")
        refType: string; // v0.9: renamed from ref_type (e.g. "ORDER")
        support?: SupportRequestInfo; // v0.9: user's contact info for support
    }
};

