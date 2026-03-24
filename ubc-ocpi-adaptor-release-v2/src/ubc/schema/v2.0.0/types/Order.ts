import { ObjectType } from "../enums/ObjectType";
import { BecknBuyer } from "./Buyer";
import { BecknFulfillment } from "./Fulfillment";
import { BecknOrderAttributes } from "./OrderAttributes";
import { BecknOrderItemResponse } from "./OrderItem";
import { BecknOrderValueResponse } from "./OrderValue";
import { BecknPayment } from "./Payment";

// v0.9: Base order type - many fields are now optional
// Different actions use different subsets of these fields
export type UBCOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:orderNumber"?: string; // v0.9: Deprecated - use beckn:id instead
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue"?: BecknOrderValueResponse;
    "beckn:payment"?: BecknPayment;
    "beckn:fulfillment"?: BecknFulfillment;
    "beckn:orderAttributes"?: BecknOrderAttributes; // v0.9: Deprecated
}