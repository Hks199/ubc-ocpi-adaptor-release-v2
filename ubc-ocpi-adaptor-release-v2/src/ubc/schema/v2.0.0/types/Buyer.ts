import { BecknOrganization } from "./Organization";
import { ObjectType } from "../enums/ObjectType";
import { Role } from "../enums/Role";

export type BecknBuyer = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld"
    "@type": ObjectType.buyer;
    "beckn:id": string;
    "beckn:role": Role.BUYER; // e.g. "BUYER"
    "beckn:displayName"?: string; // v0.9: renamed from beckn:name
    "beckn:telephone"?: string; // v0.9: renamed from beckn:phone
    "beckn:email"?: string;
    "beckn:taxID"?: string; // v0.9: renamed from beckn:taxId (uppercase ID)
    "beckn:address"?: string;
    "beckn:organization"?: BecknOrganization;
};

// Minimal buyer for track request (v0.9)
export type BecknBuyerMinimal = {
    "@context": string;
    "@type": ObjectType.buyer;
    "beckn:id": string;
};
