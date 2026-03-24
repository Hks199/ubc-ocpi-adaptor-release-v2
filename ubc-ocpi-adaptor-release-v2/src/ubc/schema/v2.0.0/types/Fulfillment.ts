import { ObjectType } from "../enums/ObjectType";
import { ChargingSessionStatus } from "../enums/ChargingSessionStatus";

// v0.9: Delivery attributes for on_confirm (simple session status)
export type DeliveryAttributesOnConfirm = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingSession/v1/context.jsonld"
    "@type": "ChargingSession";
    connectorType?: string;
    maxPowerKW?: number;
    sessionStatus: ChargingSessionStatus; // e.g. "PENDING"
};

// v0.9: Fulfillment for on_confirm response (simpler structure)
export type BecknFulfillmentOnConfirm = {
    "@context": string;
    "@type": ObjectType.fulfillment;
    "beckn:id": string;
    "beckn:mode": string; // e.g. "RESERVATION"
    "beckn:deliveryAttributes": DeliveryAttributesOnConfirm;
};

// v0.9: Charging telemetry metric
export type ChargingMetricV09 = {
    name: string; // e.g. "STATE_OF_CHARGE", "POWER", "ENERGY", "VOLTAGE", "CURRENT"
    value: number;
    unitCode: string; // e.g. "PERCENTAGE", "KWH", "KW", "VLT", "AMP"
};

// v0.9: Charging telemetry event
export type ChargingTelemetryEvent = {
    eventTime: string; // ISO 8601 timestamp
    metrics: ChargingMetricV09[];
};

// v0.9: Delivery attributes for on_track (with chargingTelemetry)
export type DeliveryAttributesOnTrack = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingService/v1/context.jsonld"
    "@type": "ChargingSession";
    chargingTelemetry: ChargingTelemetryEvent[];
};

// v0.9: Tracking action for on_track
export type TrackingAction = {
    "@type": string; // "beckn:TrackAction"
    target: {
        "@type": string; // "schema:EntryPoint"
        url: string;
    };
};

// v0.9: Fulfillment for on_track response (with trackingAction and sessionStatus at top level)
export type BecknFulfillmentOnTrack = {
    "@context": string;
    "@type": ObjectType.fulfillment;
    "beckn:id": string;
    "beckn:mode": string; // e.g. "RESERVATION"
    trackingAction?: TrackingAction;
    sessionStatus?: string; // e.g. "ACTIVE"
    "beckn:deliveryAttributes": DeliveryAttributesOnTrack;
};

// Legacy type for backwards compatibility
export type BecknFulfillment = BecknFulfillmentOnConfirm;
