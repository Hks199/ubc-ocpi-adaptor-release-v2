import { ISODateTime, OCPIPrice } from "../../../general/types";
import { OCPIAuthMethod, OCPIv211AuthMethod } from "../../cdrs/enums";
import { OCPICdrToken, OCPIChargingPeriod, OCPIv211ChargingPeriod } from "../../cdrs/types";
import { OCPIv211Location } from "../../locations/types";
import { OCPIProfileType, OCPISessionStatus, OCPIv211SessionStatus } from "../enums";

// 9.3.1
export type OCPISession = {
    country_code?: string,
    party_id?: string,
    id: string,
    start_date_time?: ISODateTime,
    end_date_time?: ISODateTime,
    kwh: number,
    cdr_token?: OCPICdrToken,
    auth_method?: OCPIAuthMethod,
    authorization_reference?: string,
    location_id?: string,
    evse_uid?: string,
    connector_id?: string,
    meter_id?: string,
    currency?: string,
    charging_periods?: OCPIChargingPeriod[],
    total_cost?: OCPIPrice,
    status?: OCPISessionStatus,
    last_updated?: ISODateTime,
    cpo_session_id?: string,
}

// #OCPIv2.1.1
// 9.3.1
export type OCPIv211Session = {
    id: string,
    start_datetime: ISODateTime,
    end_datetime?: ISODateTime,
    kwh: number,
    auth_id: string,
    auth_method: OCPIv211AuthMethod,
    location: OCPIv211Location,
    meter_id?: string,
    currency: string,
    charging_periods?: OCPIv211ChargingPeriod[],
    total_cost?: number,
    status: OCPIv211SessionStatus,
    last_updated: ISODateTime,
}

// 9.3.2
export type OCPIChargingPreferences = {
    profile_type: OCPIProfileType,
    departure_time?: ISODateTime,
    energy_need?: number,
    discharge_allowed?: boolean,
}

export type OCPIPatchSession = {
    country_code: string,
    party_id: string,
    id: string,
    start_date_time?: ISODateTime,
    end_date_time?: ISODateTime,
    kwh?: number,
    cdr_token?: OCPICdrToken,
    auth_method?: OCPIAuthMethod,
    authorization_reference?: string,
    location_id?: string,
    evse_uid?: string,
    connector_id?: string,
    meter_id?: string,
    currency?: string,
    charging_periods?: OCPIChargingPeriod[],
    total_cost?: OCPIPrice,
    status?: OCPISessionStatus,
    last_updated: ISODateTime,
}

type OCPIv211SessionConnector = {
    id: string,
}

type OCPIv211SessionEVSE = {
    uid: string,
    connectors: OCPIv211SessionConnector[]
}

type OCPIv211SessionLocation = {
    id: string,
    evses: OCPIv211SessionEVSE[]
}

// #OCPIv2.1.1
export type OCPIv211PatchSession = {
    id: string,
    start_datetime?: ISODateTime,
    end_datetime?: ISODateTime,
    kwh?: number,
    auth_id?: string,
    auth_method?: OCPIv211AuthMethod,
    location?: OCPIv211SessionLocation,
    meter_id?: string,
    currency?: string,
    charging_periods?: OCPIv211ChargingPeriod[],
    total_cost?: number,
    status?: OCPIv211SessionStatus,
    last_updated?: ISODateTime,
}

