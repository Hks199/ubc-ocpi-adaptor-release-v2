import { BecknDescriptor } from "./Descriptor";
import { BecknOfferPrice } from "./OfferPrice";
import { BecknTimePeriod } from "./TimePeriod";
import { BecknOfferAttributes } from "./OfferAttributes";
import { ObjectType } from "../enums/ObjectType";
import { AcceptedPaymentMethod } from "../enums/AcceptedPaymentMethod";

// AcceptedOffer (and inner types)
export type BecknAcceptedOffer = {
    "@context": string;
    "@type": ObjectType.offer;
    "beckn:id": string;
    "beckn:descriptor": BecknDescriptor;
    "beckn:items"?: string[]; // item references
    "beckn:price": BecknOfferPrice;
    "beckn:validity": BecknTimePeriod;
    "beckn:acceptedPaymentMethod"?: AcceptedPaymentMethod[];
    "beckn:offerAttributes": BecknOfferAttributes;
};
