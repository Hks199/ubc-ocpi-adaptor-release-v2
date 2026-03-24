import { OCPITariff, OCPIv211PatchTariff, OCPIv211Tariff } from ".";

export type OCPIPutTariffRequestPayload = OCPITariff;

// #OCPIv2.1.1
export type OCPIv211PutTariffRequestPayload = OCPIv211Tariff;

export type OCPIv211PatchTariffRequestPayload = OCPIv211PatchTariff


// For CPOs
export type OCPISendGetTariffFromEmspRequestPayload = {
    platform_id: string,
    client_id: string,
    internal_client_id: string,
    ocpi_tariff_id: string,
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