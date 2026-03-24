import { ObjectType } from "../../../enums/ObjectType";
import { Context } from "../../../types/Context";
import { BecknBuyer } from "../../../types/Buyer";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";
import { BecknOrderItem } from "../../../types/OrderItem";
import { BecknOrderValue } from "../../../types/OrderValue";

export type UBCSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCSelectOrder;
    };
};

export type UBCSelectOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer; // Required per schema (lines 1039-1048)
    "beckn:orderValue": BecknOrderValue;
    "beckn:orderItems": BecknOrderItem[];
    "beckn:orderAttributes": BecknOrderAttributes;
};
