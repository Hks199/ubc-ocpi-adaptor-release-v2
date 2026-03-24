import { OrderStatus } from "../../../enums/OrderStatus";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { ObjectType } from "../../../enums/ObjectType";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";

export type UBCOnSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCOnSelectOrder;
    };
};

export type UBCOnSelectOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:orderStatus": OrderStatus;
    "beckn:seller": string;
    "beckn:buyer": any; // Required per schema (lines 1127-1136)
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:orderAttributes": BecknOrderAttributes;
    // Per schema example (lines 1122-1232): on_select should NOT include beckn:id or beckn:fulfillment
};
