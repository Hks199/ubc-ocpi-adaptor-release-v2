import { ObjectType } from "../../../enums/ObjectType";
import { OrderStatus } from "../../../enums/OrderStatus";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPayment } from "../../../types/Payment";

/**
 * On_Cancel Request Payload - response from BPP after cancel request
 */
export type UBCOnCancelRequestPayload = {
    context: Context,
    message: {
        order: UBCOnCancelOrder,
    },
};

/**
 * On_Cancel Order - includes cancellation status and payment info
 */
export type UBCOnCancelOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": OrderStatus; // CANCELLED or REJECTED
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": Array<{
        "beckn:orderedItem": string;
        "beckn:quantity"?: {
            unitText: string;
            unitCode: string;
            unitQuantity: number;
        };
        "beckn:price"?: {
            currency: string;
            value: number;
            applicableQuantity?: {
                unitText: string;
                unitCode: string;
                unitQuantity: number;
            };
        };
    }>;
    "beckn:orderValue"?: BecknOrderValueResponse;
    "beckn:payment"?: BecknPayment; // Payment status may show REFUNDED
};

