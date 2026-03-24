import { ISODateTime } from "../types";

export type OCPIPaginationQueryParams = {
    date_from: ISODateTime
    date_to: ISODateTime
    offset: number
    limit: number
}

export type OCPISendGetLocationsRequestPayload = {
    platform_id: string,
    client_id: string,
    partial?: boolean,
    date_from?: string,
    date_to?: string,
    offset?: number,
    limit?: number,
}

export type OCPISendGetLocationRequestPayload = {
    platform_id: string,
    client_id: string,
    location_id: string,
    evse_uid?: string,
    connector_id?: string,
}

export type OCPISendGetSessionsRequestPayload = {
    platform_id: string,
    client_id: string,
    partial?: boolean,
    date_from?: string,
    date_to?: string,
    offset?: number,
    limit?: number,
}

export type OCPISendGetCDRsRequestPayload = {
    platform_id: string,
    client_id: string,
    partial?: boolean,
    date_from?: string,
    date_to?: string,
    offset?: number,
    limit?: number,
}

export type OCPISendGetTariffsRequestPayload = {
    platform_id: string,
    client_id: string,
    partial?: boolean,
    date_from?: string,
    date_to?: string,
    offset?: number,
    limit?: number,
}

export type OCPISendGetTariffRequestPayload = {
    platform_id: string,
    client_id: string,
    tariff_id: string,
}

export type OCPIPatchLocationRequestPayload = {
    country_code: string,
    party_id: string,
    location_id: string,
    evse_uid?: string,
    connector_id?: string,
}

export type OCPIReceiveGetTariffsRequestPayload = {
    date_from?: string,
    date_to?: string,
    offset?: number,
    limit?: number,
}

export type OCPISendUpdateTariffRequestPayload = {
    platform_id: string,
    client_id: string,
    internal_client_id: string,
    tariff_profile_id: string,
}

export type OCPIReceiveGetCDRRequestPayload = {
    date_from?: string,
    date_to?: string,
    offset?: number,
    limit?: number,
}

export type OCPISendUpdateCDRRequestPayload = {
    platform_id: string,
    client_id: string,
    internal_client_id: string,
    bill_id: string,
}

export type OCPISendGetCDRRequestPayload = {
    platform_id: string,
    client_id: string,
    ocpi_bill_id: string,
    internal_client_id: string,
}
