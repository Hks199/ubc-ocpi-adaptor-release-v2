import { OrderStatus } from "../../../enums/OrderStatus";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { ObjectType } from "../../../enums/ObjectType";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";

/** Top-level error on `on_select` (e.g. business rejection), aligned with Beckn error envelope. */
export type UBCOnSelectErrorBody = {
    code: string;
    message: string;
    details?: {
        description?: string;
    };
};

export type UBCOnSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCOnSelectOrder;
    };
    /** Present when the BPP rejects the select (e.g. slot overlap, connector not found). */
    error?: UBCOnSelectErrorBody;
};

export type UBCOnSelectOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:orderStatus": OrderStatus;
    "beckn:seller": string;
    "beckn:buyer": any; // Required per schema (lines 1127-1136)
    "beckn:orderItems": BecknOrderItemResponse[];
    /** Omitted when `beckn:orderStatus` is REJECTED and `error` is set. */
    "beckn:orderValue"?: BecknOrderValueResponse;
    "beckn:orderAttributes": BecknOrderAttributes;
    // Per schema example (lines 1122-1232): on_select should NOT include beckn:id or beckn:fulfillment
};
