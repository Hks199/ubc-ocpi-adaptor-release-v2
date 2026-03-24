import { BecknAcceptedOffer } from "./AcceptedOffer";
import { BecknOfferPrice } from "./OfferPrice";
import { Quantity } from "./Quantity";

// OrderItem
export type BecknOrderItem = {
    "beckn:lineId"?: string;
    "beckn:orderedItem": string;
    "beckn:quantity": Quantity; // e.g., 2.5
    "beckn:acceptedOffer"?: BecknAcceptedOffer;
};

// v0.9: OrderItem response - quantity and price are now directly on the item
export type BecknOrderItemResponse = {
    "beckn:lineId"?: string;
    "beckn:orderedItem": string;
    "beckn:quantity"?: Quantity; // v0.9: { unitText, unitCode, unitQuantity }
    "beckn:acceptedOffer"?: BecknAcceptedOffer;
    "beckn:price"?: BecknOfferPrice; // v0.9: { currency, value, applicableQuantity }
};
