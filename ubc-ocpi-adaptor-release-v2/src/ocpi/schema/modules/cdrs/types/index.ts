import { ISODateTime } from "../../../general/types";
import { OCPIPrice } from "../../../general/types";
import { OCPIConnectorFormat, OCPIConnectorType, OCPIPowerType } from "../../locations/enums";
import { OCPIGeoLocation, OCPIv211Location } from "../../locations/types";
import { OCPITariff, OCPIv211Tariff } from "../../tariffs/types";
import { OCPITokenType } from "../../tokens/enums";
import { OCPIAuthMethod, OCPICdrDimensionType, OCPIv211AuthMethod, OCPIv211CdrDimensionType } from "../enums";

// 10.4.2
export type OCPICdrDimension = {
    type: OCPICdrDimensionType,
    volume: number,
}

// #OCPIv2.1.1
// 10.4.2
export type OCPIv211CdrDimension = {
    type: OCPIv211CdrDimensionType,
    volume: number,
}

// 10.4.4
export type OCPICdrLocation = {
    id: string,
    publish?: boolean,
    name?: string,
    address: string,
    city: string,
    postal_code?: string,
    state?: string,
    country: string,
    coordinates: OCPIGeoLocation,
    evse_uid: string,
    evse_id: string,
    connector_id: string,
    connector_standard: OCPIConnectorType,
    connector_format: OCPIConnectorFormat,
    connector_power_type: OCPIPowerType,
}

// 10.4.5
export type OCPICdrToken = {
    country_code?: string,
    party_id?: string,
    uid: string,
    type: OCPITokenType,
    contract_id?: string,
}

// 10.4.6
export type OCPIChargingPeriod = {
    start_date_time: ISODateTime,
    dimensions: OCPICdrDimension[],
    tariff_id?: string,
}

// #OCPIv2.1.1
// 10.4.4
export type OCPIv211ChargingPeriod = {
    start_date_time: ISODateTime,
    dimensions: OCPIv211CdrDimension[],
}

// 10.4.8
export type OCPISignedValue = {
    nature: string,
    plain_data: string,
    signed_data: string,
}

// 10.4.7
export type OCPISignedData = {
    encoding_method: string,
    encoding_method_version?: bigint,
    public_key?: string,
    signed_values: OCPISignedValue[],
    url?: string,
}

// 10.3.1
export type OCPICDR = {
    country_code: string,
    party_id: string,
    id: string,
    start_date_time: ISODateTime,
    end_date_time: ISODateTime,
    session_id?: string,
    cdr_token: OCPICdrToken,
    auth_method: OCPIAuthMethod,
    authorization_reference?: string,
    cdr_location: OCPICdrLocation,
    meter_id?: string,
    currency: string,
    tariffs?: OCPITariff[],
    charging_periods: OCPIChargingPeriod[],
    signed_data?: OCPISignedData,
    total_cost: OCPIPrice,
    total_fixed_cost?: OCPIPrice,
    total_energy: number,
    total_energy_cost?: OCPIPrice,
    total_time: number,
    total_time_cost?: OCPIPrice,
    total_parking_time?: number,
    total_parking_cost?: OCPIPrice,
    total_reservation_cost?: OCPIPrice,
    remark?: string,
    invoice_reference_id?: string,
    credit?: boolean,
    credit_reference_id?: string,
    home_charging_compensation?: boolean,
    last_updated: ISODateTime,
    remarks?: string,
}

// #OCPIv2.1.1
// 10.3.1
export type OCPIv211CDR = {
    id: string,
    start_date_time: ISODateTime,
    stop_date_time: ISODateTime,
    auth_id: string,
    auth_method: OCPIv211AuthMethod,
    location: OCPIv211Location,
    meter_id?: string,
    currency: string,
    tariffs?: OCPIv211Tariff[],
    charging_periods: OCPIv211ChargingPeriod[],
    total_cost: number,
    total_energy: number,
    total_time: number,
    total_parking_time?: number,
    remark?: string,
    last_updated: ISODateTime,
}
