import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyerMinimal } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillmentOnTrack } from "../../../types/Fulfillment";
import { TrackOrderItem } from "./TrackPayload";

// v0.9: OnTrack order includes seller, buyer (minimal), orderItems, and fulfillment
export type UBCOnTrackOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string; // v0.9: "INPROGRESS"
    "beckn:seller": string;
    "beckn:buyer": BecknBuyerMinimal;
    "beckn:orderItems": TrackOrderItem[];
    "beckn:fulfillment": BecknFulfillmentOnTrack; // v0.9: has trackingAction, sessionStatus, deliveryAttributes with chargingTelemetry
};

export type UBCOnTrackRequestPayload = {
    context: Context,
    message: {
        order: UBCOnTrackOrder
    },
}
