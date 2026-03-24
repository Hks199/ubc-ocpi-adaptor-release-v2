import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPaymentInit } from "../../../types/Payment";

export type UBCInitRequestPayload = {
    context: Context,
    message: {
        order: UBCInitOrder,
    },
};

// v0.9: Init order no longer has fulfillment or orderAttributes
// v0.9: Now includes payment with paymentAttributes (settlementAccounts)
export type UBCInitOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:orderStatus": string; // v0.9: "CREATED"
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:payment": BecknPaymentInit; // v0.9: added payment with paymentAttributes
}
