import { ChargePointErrorCode } from "../../../general/enum";
import { ISODateTime } from "../../../general/types";
import { OCPIDisplayText, URL } from "../../../general/types";
import { OCPITokenType } from "../../tokens/enums";
import {
    OCPICapability, OCPIConnectorFormat, OCPIConnectorType, OCPIEnergySourceCategory, OCPIEnvironmentalImpactCategory, OCPIFacility, OCPIImageCategory, OCPIParkingRestriction, OCPIParkingType, OCPIPowerType, OCPIStatus,
    OCPIv211Capability, OCPIv211ConnectorType, OCPIv211Facility, OCPIv211LocationType, OCPIv211PowerType
} from "../enums";

// 8.4.15
export type OCPIImageClass = {
    url: URL
    thumbnail?: URL
    category: OCPIImageCategory
    type: 'gif' | 'jpeg' | 'png' | 'svg'
    width?: number
    height?: number
}

// 8.4.1
export type OCPIAdditionalGeoLocation = {
    latitude: string,
    longitude: string,
    name?: OCPIDisplayText,
}

// 8.4.2
export type OCPIBusinessDetailsClass = {
    name: string,
    website?: string,
    logo?: OCPIImageClass,
}

// 8.4.7
export type OCPIEnergySource = {
    source: OCPIEnergySourceCategory,
    percentage: number,
}

// 8.4.9
export type OCPIEnvironmentalImpact = {
    category: OCPIEnvironmentalImpactCategory,
    amount: number,
}

// #OCPIv2.1.1
// 8.4.9
export type OCPIv211EnvironmentalImpact = {
    source: OCPIEnvironmentalImpactCategory,
    amount: number,
}

// 8.4.6
export type OCPIEnergyMix = {
    is_green_energy: boolean,
    energy_sources?: OCPIEnergySource[],
    environ_impact?: OCPIEnvironmentalImpact[],
    supplier_name?: string,
    energy_product_name?: string,
}

// #OCPIv2.1.1
// 8.4.6
export type OCPIv211EnergyMix = {
    is_green_energy: boolean,
    energy_sources?: OCPIEnergySource[],
    environ_impact?: OCPIv211EnvironmentalImpact[],
    supplier_name?: string,
    energy_product_name?: string,
}

// 8.4.11
export type OCPIExceptionalPeriod = {
    period_begin: ISODateTime,
    period_end: ISODateTime,
}

// 8.4.13
export type OCPIGeoLocation = {
    latitude: string,
    longitude: string,
}

// 8.4.21
export type OCPIRegularHours = {
    weekday: bigint,
    period_begin: string,
    period_end: string,
}

// 8.4.14
export type OCPIHours = {
    twentyfourseven: boolean,
    regular_hours?: OCPIRegularHours[],
    exceptional_openings?: OCPIExceptionalPeriod[],
    exceptional_closings?: OCPIExceptionalPeriod[],
}

// #OCPIv2.1.1
// 8.4.14
export type OCPIv211Hours = {
    twentyfourseven: boolean,
    regular_hours?: OCPIRegularHours[],
    exceptional_openings?: OCPIExceptionalPeriod[],
    exceptional_closings?: OCPIExceptionalPeriod[],
}

// 8.4.20
export type OCPIPublishTokenType = {
    uid?: string,
    type?: OCPITokenType,
    visual_number?: string,
    issuer?: string,
    group_id?: string,
}

// 8.4.23
export type OCPIStatusSchedule = {
    period_begin: ISODateTime,
    period_end?: ISODateTime,
    status: OCPIStatus,
}

// 8.3.3
export type OCPIConnector = {
    id: string,
    standard: OCPIConnectorType,
    format: OCPIConnectorFormat,
    qr_code?: string,
    power_type: OCPIPowerType,
    max_voltage: bigint,
    max_amperage: bigint,
    max_electric_power?: bigint,
    tariff_ids?: string[],
    terms_and_conditions?: URL,
    last_updated: ISODateTime,
}

// #OCPIv2.1.1
// 8.3.3
export type OCPIv211Connector = {
    id: string,
    standard: OCPIv211ConnectorType,
    format: OCPIConnectorFormat,
    qr_code?: string,
    power_type: OCPIv211PowerType,
    voltage: bigint,
    amperage: bigint,
    tariff_id: string,
    terms_and_conditions?: URL,
    last_updated: ISODateTime,
}

// 8.3.2
export type OCPIEVSE = {
    uid: string,
    evse_id?: string,
    status: OCPIStatus,
    status_schedule?: OCPIStatusSchedule[],
    capabilities?: OCPICapability[],
    connectors: OCPIConnector[],
    floor_level?: string,
    coordinates?: OCPIGeoLocation,
    physical_reference?: string,
    directions?: OCPIDisplayText[],
    parking_restrictions?: OCPIParkingRestriction[],
    images?: OCPIImageClass[],
    last_updated: ISODateTime,
    status_errorcode?: ChargePointErrorCode | string,
    status_errordescription?: string,
}

// #OCPIv2.1.1
// 8.3.2
export type OCPIv211EVSE = {
    uid: string,
    evse_id?: string,
    status: OCPIStatus,
    status_schedule?: OCPIStatusSchedule[],
    capabilities?: OCPIv211Capability[],
    connectors: OCPIv211Connector[],
    floor_level?: string,
    coordinates?: OCPIGeoLocation,
    physical_reference?: string,
    directions?: OCPIDisplayText[],
    parking_restrictions?: OCPIParkingRestriction[],
    images?: OCPIImageClass[],
    last_updated: ISODateTime,
}

// 8.3.1
export type OCPILocation = {
    country_code: string,
    party_id: string,
    id: string,
    publish: boolean,
    publish_allowed_to?: OCPIPublishTokenType[],
    name?: string,
    address: string,
    city: string,
    postal_code?: string,
    state?: string,
    country: string,
    coordinates: OCPIGeoLocation,
    related_locations?: OCPIAdditionalGeoLocation[],
    parking_type?: OCPIParkingType,
    evses?: OCPIEVSE[],
    directions?: OCPIDisplayText[],
    operator?: OCPIBusinessDetailsClass,
    suboperator?: OCPIBusinessDetailsClass,
    owner?: OCPIBusinessDetailsClass,
    facilities?: OCPIFacility[],
    time_zone: string,
    opening_times?: OCPIHours,
    charging_when_closed?: boolean,
    images?: OCPIImageClass[],
    energy_mix?: OCPIEnergyMix,
    last_updated: ISODateTime,
}

// #OCPIv2.1.1
// 8.3.1
export type OCPIv211Location = {
    id: string,
    type: OCPIv211LocationType,
    name?: string,
    address: string,
    city: string,
    postal_code?: string,
    country: string,
    coordinates: OCPIGeoLocation,
    related_locations?: OCPIAdditionalGeoLocation[],
    evses?: OCPIv211EVSE[],
    directions?: OCPIDisplayText[],
    operator?: OCPIBusinessDetailsClass,
    suboperator?: OCPIBusinessDetailsClass,
    owner?: OCPIBusinessDetailsClass,
    facilities?: OCPIv211Facility[],
    time_zone: string,
    opening_times?: OCPIv211Hours,
    charging_when_closed?: boolean,
    images?: OCPIImageClass[],
    energy_mix?: OCPIv211EnergyMix,
    last_updated: ISODateTime,
}

export type OCPIPatchConnector = {
    standard?: OCPIConnectorType,
    format?: OCPIConnectorFormat,
    qr_code?: string,
    power_type?: OCPIPowerType,
    max_voltage?: bigint,
    max_amperage?: bigint,
    max_electric_power?: bigint,
    tariff_ids?: string[],
    terms_and_conditions?: URL,
    last_updated: ISODateTime,
    status?: OCPIStatus, // added for some CPOs
    status_errorcode?: ChargePointErrorCode,
    status_errordescription?: string,
}

// #OCPIv2.1.1
export type OCPIv211PatchConnector = {
    standard?: OCPIv211ConnectorType,
    format?: OCPIConnectorFormat,
    power_type?: OCPIv211PowerType,
    voltage?: bigint,
    amperage?: bigint,
    tariff_id?: string,
    terms_and_conditions?: URL,
    last_updated?: ISODateTime, // v2.1.1 has last_updated optional
}

export type OCPIPatchEVSE = {
    evse_id?: string,
    status?: OCPIStatus,
    status_schedule?: OCPIStatusSchedule[],
    capabilities?: OCPICapability[],
    floor_level?: string,
    coordinates?: OCPIGeoLocation,
    physical_reference?: string,
    directions?: OCPIDisplayText[],
    parking_restrictions?: OCPIParkingRestriction[],
    images?: OCPIImageClass[],
    last_updated: ISODateTime,
    status_errorcode?: ChargePointErrorCode,
    status_errordescription?: string,
    has_battery_backup?: boolean,
}

// #OCPIv2.1.1
export type OCPIv211PatchEVSE = {
    evse_id?: string,
    status?: OCPIStatus,
    status_schedule?: OCPIStatusSchedule[],
    capabilities?: OCPIv211Capability[],
    floor_level?: string,
    coordinates?: OCPIGeoLocation,
    physical_reference?: string,
    directions?: OCPIDisplayText[],
    parking_restrictions?: OCPIParkingRestriction[],
    images?: OCPIImageClass[],
    last_updated?: ISODateTime,
    has_battery_backup?: boolean,
}

export type OCPIPatchLocation = {
    publish?: boolean,
    publish_allowed_to?: OCPIPublishTokenType[],
    name?: string,
    address?: string,
    city?: string,
    postal_code?: string,
    state?: string,
    country?: string,
    coordinates?: OCPIGeoLocation,
    related_locations?: OCPIAdditionalGeoLocation[],
    parking_type?: OCPIParkingType,
    directions?: OCPIDisplayText[],
    operator?: OCPIBusinessDetailsClass,
    suboperator?: OCPIBusinessDetailsClass,
    owner?: OCPIBusinessDetailsClass,
    facilities?: OCPIFacility[],
    time_zone?: string,
    opening_times?: OCPIHours,
    charging_when_closed?: boolean,
    images?: OCPIImageClass[],
    energy_mix?: OCPIEnergyMix,
    last_updated: ISODateTime,
}

// #OCPIv2.1.1
export type OCPIv211PatchLocation = {
    type?: OCPIv211LocationType,
    name?: string,
    address?: string,
    city?: string,
    postal_code?: string,
    country?: string,
    coordinates?: OCPIGeoLocation,
    related_locations?: OCPIAdditionalGeoLocation[],
    directions?: OCPIDisplayText[],
    operator?: OCPIBusinessDetailsClass,
    suboperator?: OCPIBusinessDetailsClass,
    owner?: OCPIBusinessDetailsClass,
    facilities?: OCPIv211Facility[],
    time_zone?: string,
    opening_times?: OCPIv211Hours,
    charging_when_closed?: boolean,
    images?: OCPIImageClass[],
    energy_mix?: OCPIv211EnergyMix,
    last_updated?: ISODateTime,
}
