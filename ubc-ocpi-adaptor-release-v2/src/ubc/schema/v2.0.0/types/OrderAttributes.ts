import { ChargingSessionStatus } from "../enums/ChargingSessionStatus";
import { ObjectType } from "../enums/ObjectType";
import { BuyerFinderFee } from "./BuyerFinderFee";

// ChargingSessionAttributes (deliveryAttributes/OrderAttributes), applies to both
export type BecknOrderAttributes = {
    "@context": string;
    "@type": ObjectType.chargingSession;
    // The below are optional/conditional depending on context
    sessionStatus?: ChargingSessionStatus;
    authorizationMode?: string;
    connectorType?: string;
    maxPowerKW?: number;
    reservationId?: string;
    authorization?: {
        type: string;
    };
    gracePeriodMinutes?: number;
    // This block is sometimes part of attributes (see: orderAttributes)
    buyerFinderFee?: BuyerFinderFee;
    idleFeePolicy?: string;
    authorizationOtpHint?: string;
    trackingId?: string;
    trackingUrl?: string;
    trackingStatus?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    /** Estimate helper for BAP → frontend (e.g. kWh at max power) */
    durationInMinutes?: number;
    /** Optional cancellation terms for estimate / order UI */
    cancellationPolicy?: {
        fee?: { percentage?: string };
        externalRef?: { url?: string; mimetype?: string };
    };
    sessionPreferences?: {
        preferredStartTime?: string;
        preferredEndTime?: string;
        notificationPreferences?: {
            email?: boolean;
            sms?: boolean;
            push?: boolean;
        };
    };
}
