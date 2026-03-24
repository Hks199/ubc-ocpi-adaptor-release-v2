import { ObjectType } from "../enums/ObjectType";

// Descriptor
export type BecknDescriptor = {
    "@type": ObjectType.descriptor;
    "schema:name": string;
    "beckn:shortDesc"?: string;
    "beckn:longDesc"?: string;
};

