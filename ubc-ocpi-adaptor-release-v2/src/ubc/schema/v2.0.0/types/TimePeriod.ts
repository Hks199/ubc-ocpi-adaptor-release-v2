import { ObjectType } from "../enums/ObjectType";

// TimePeriod
export type BecknTimePeriod = {
    "@type": ObjectType.timePeriod;
    "schema:startDate": string; // ISO 8601
    "schema:endDate": string;
    "schema:startTime"?: string; // For availability windows
    "schema:endTime"?: string; // For availability windows
};
