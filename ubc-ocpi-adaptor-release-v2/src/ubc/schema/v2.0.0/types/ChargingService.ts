import { BecknServiceLocation } from "./Location";

// Charging Station type
export type ChargingStation = {
    id: string;
    serviceLocation: BecknServiceLocation;
};

// Item Attributes for ChargingService
export type BecknChargingServiceAttributes = {
    "@context": string;
    "@type": "ChargingService";
    connectorType?: string;
    maxPowerKW?: number;
    minPowerKW?: number;
    reservationSupported?: boolean;
    chargingStation?: ChargingStation;
    amenityFeature?: string[];
    evseId?: string;
    parkingType?: string;
    connectorId?: string;
    powerType?: string;
    connectorFormat?: string;
    chargingSpeed?: string;
    vehicleType?: string;
    stationStatus?: string;
    ocppId?: string;
    socketCount?: number;
    roamingNetwork?: string;
};

