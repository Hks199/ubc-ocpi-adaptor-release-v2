import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyerMinimal } from "../../../types/Buyer";
import { Context } from "../../../types/Context";

// v0.9: Minimal order item for track request (just orderedItem)
export type TrackOrderItem = {
    "beckn:orderedItem": string;
};

// v0.9: Track order includes seller, buyer (minimal), and orderItems
export type UBCTrackOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string; // v0.9: "INPROGRESS"
    "beckn:seller": string;
    "beckn:buyer": BecknBuyerMinimal;
    "beckn:orderItems": TrackOrderItem[];
};

export type UBCTrackRequestPayload = {
    context: Context,
    message: {
        order: UBCTrackOrder,
    }
};

