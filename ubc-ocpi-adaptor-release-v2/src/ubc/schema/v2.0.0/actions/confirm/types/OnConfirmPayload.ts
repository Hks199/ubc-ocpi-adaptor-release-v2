import { ObjectType } from "../../../enums/ObjectType";
import { OrderStatus } from "../../../enums/OrderStatus";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillmentOnConfirm } from "../../../types/Fulfillment";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPaymentConfirm } from "../../../types/Payment";

export type UBCOnConfirmRequestPayload = {
    context: Context;
    message: {
        order: UBCOnConfirmOrder;
    };
};

// v0.9: OnConfirm order - has fulfillment with deliveryAttributes (sessionStatus)
// v0.9: Removed orderNumber, orderAttributes
export type UBCOnConfirmOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string; // v0.9: order id
    "beckn:orderStatus": OrderStatus; // v0.9: "CONFIRMED"
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:fulfillment": BecknFulfillmentOnConfirm; // v0.9: has deliveryAttributes with sessionStatus
    "beckn:payment": BecknPaymentConfirm; // v0.9: payment with paidAt
}
