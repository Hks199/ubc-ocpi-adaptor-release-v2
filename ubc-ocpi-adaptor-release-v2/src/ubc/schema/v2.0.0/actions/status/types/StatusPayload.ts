import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillment } from "../../../types/Fulfillment";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPayment } from "../../../types/Payment";

export type UBCStatusRequestPayload = {
    context: Context;
    message: {
        order: UBCStatusOrder;
    };
};

export type UBCStatusOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": Array<{
        "beckn:orderedItem": string;
    }>;
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:fulfillment": BecknFulfillment;
    "beckn:payment": BecknPayment;
};

