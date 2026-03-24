import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillment } from "../../../types/Fulfillment";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPayment } from "../../../types/Payment";

export type UBCUpdateOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:payment": BecknPayment;
    "beckn:fulfillment": BecknFulfillment;
    // Per schema (lines 2148-2238, 5747-5835): orderAttributes and orderNumber are NOT present in update examples
}

export type UpdateMessage = {
    update_target?: string;
    order: UBCUpdateOrder;
};

export type UBCUpdateRequestPayload = {
    context: Context,
    message: UpdateMessage,
};
