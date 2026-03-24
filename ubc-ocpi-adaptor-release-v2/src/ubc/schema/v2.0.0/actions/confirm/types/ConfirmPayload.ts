import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPaymentConfirm } from "../../../types/Payment";

export type UBCConfirmRequestPayload = {
    context: Context,
    message: {
        order: UBCConfirmOrder,
    },
};

// v0.9: Confirm order - removed fulfillment, orderAttributes
// v0.9: Has beckn:id (order id from on_init), payment with paidAt
export type UBCConfirmOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string; // v0.9: order id from on_init
    "beckn:orderStatus": string; // v0.9: "PENDING"
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:payment": BecknPaymentConfirm; // v0.9: has paidAt for completed payment
}
