import { OCPICDR, OCPIv211CDR } from ".";

export type OCPIPostCDRRequestPayload = OCPICDR;

// #OCPIv2.1.1
export type OCPIv211PostCDRRequestPayload = OCPIv211CDR;


// For CPOs
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
