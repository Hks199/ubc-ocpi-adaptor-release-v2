import { OrderStatus } from "../../../enums/OrderStatus";
import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";

export enum ChargingMetricsName {
    soc = 'STATE_OF_CHARGE',
    power = 'POWER',
    energy = 'ENERGY',
    voltage = 'VOLTAGE',
    current = 'CURRENT',
}

export type ChargingMetric = {
    name: ChargingMetricsName;
    value: number;
    unit?: string;
};

export type ChargingTelemetry = {
    event_time: string;
    metrics: ChargingMetric[];
};

// Internal backend response shape for track
export type UBCAppOnTrackResponsePayload = {
    order_id: string;
    order_status: OrderStatus;
    charge_point_connector_id: string;
    track_url?: string;
    telemetry_data: ChargingTelemetry;
    session_status?: ChargingSessionStatus;
};


