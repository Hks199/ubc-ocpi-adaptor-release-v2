import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";

export type UBCCancelRequestPayload = {
    context: Context,
    message: {
        order: UBCCancelOrder,
    },
};

/**
 * Cancel Order - includes order details to cancel
 */
export type UBCCancelOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string; // Order ID to cancel
    "beckn:orderStatus": string; // Current order status (CONFIRMED)
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": Array<{
        "beckn:orderedItem": string; // Connector ID
        "beckn:quantity"?: {
            unitText: string;
            unitCode: string;
            unitQuantity: number;
        };
    }>;
};

