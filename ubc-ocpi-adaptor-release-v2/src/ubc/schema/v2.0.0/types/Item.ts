import { ObjectType } from "../enums/ObjectType";
import { BecknDescriptor } from "./Descriptor";
import { BecknCategory } from "./Category";
import { BecknLocation } from "./Location";
import { BecknRating } from "./Rating";
import { BecknProvider } from "./Provider";
import { BecknChargingServiceAttributes } from "./ChargingService";

// Availability Window type (with startTime/endTime instead of startDate/endDate)
export type BecknAvailabilityWindow = {
    "@type": ObjectType.timePeriod;
    "schema:startTime": string;
    "schema:endTime": string;
};

// Item type for discover/catalog
export type BecknItem = {
    "@context": string;
    "@type": ObjectType.item;
    "beckn:id": string;
    "beckn:descriptor": BecknDescriptor;
    "beckn:category": BecknCategory;
    "beckn:availableAt"?: BecknLocation[]; // Optional - not in publish schema per TSD v0.9
    "beckn:availabilityWindow"?: BecknAvailabilityWindow[];
    "beckn:rateable"?: boolean;
    "beckn:rating"?: BecknRating;
    "beckn:isActive"?: boolean;
    "beckn:networkId"?: string[];
    "beckn:provider"?: BecknProvider;
    "beckn:itemAttributes": BecknChargingServiceAttributes;
};

