import { ObjectType } from "../enums/ObjectType";
import { BecknOfferPrice } from "./OfferPrice";
import { BecknTimePeriod } from "./TimePeriod";
import { BecknOfferAttributes } from "./OfferAttributes";
import { BecknDescriptor } from "./Descriptor";
import { AcceptedPaymentMethod } from "../enums/AcceptedPaymentMethod";

// Offer type for catalog (different from BecknAcceptedOffer)
export type BecknCatalogOffer = {
    "@type": ObjectType.offer;
    "@context": string;
    "beckn:id": string;
    "beckn:items": string[];
    "beckn:price": BecknOfferPrice;
    "beckn:provider"?: string; // String in publish catalog per TSD v0.9
    "beckn:validity": BecknTimePeriod;
    "beckn:descriptor": BecknDescriptor;
    "beckn:offerAttributes": BecknOfferAttributes;
    "beckn:acceptedPaymentMethod"?: AcceptedPaymentMethod[];
};

