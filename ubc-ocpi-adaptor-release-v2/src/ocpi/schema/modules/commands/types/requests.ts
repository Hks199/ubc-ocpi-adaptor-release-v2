import { ISODateTime, OCPIDisplayText, URL } from "../../../general/types";
import { OCPIToken, OCPITokenWithInitiator, OCPIv211Token } from "../../tokens/types";
import { OCPICommandResultType } from "../enums";

// 13.3.1
export type OCPICancelReservation = {
    response_url: URL,
    reservation_id: string,
}

// 13.3.4
export type OCPIReserveNow = {
    response_url: URL,
    token: OCPIToken,
    expiry_date: ISODateTime,
    reservation_id: string,
    location_id: string,
    evse_uid?: string,
    authorization_reference?: string,
}

// #OCPIv2.1.1
// 13.3.2
export type OCPIv211ReserveNow = {
    response_url: URL,
    token: OCPIv211Token,
    expiry_date: ISODateTime,
    reservation_id: bigint,
    location_id: string,
    evse_uid?: string,
}

// 13.3.5
export type OCPIStartSession = {
    response_url: URL,
    token: OCPIToken,
    location_id: string,
    evse_uid?: string,
    connector_id?: string,
    authorization_reference?: string,
}

// #OCPIv2.1.1
// 13.3.3
export type OCPIv211StartSession = {
    response_url: URL,
    token: OCPIv211Token,
    location_id: string,
    evse_uid?: string,
}

// 13.3.6
export type OCPIStopSession = {
    response_url: URL,
    session_id: string,
}

// 13.3.7
export type OCPIUnlockConnector = {
    response_url: URL,
    location_id: string,
    evse_uid: string,
    connector_id: string,
}

// 13.3.3
export type OCPICommandResult = {
    result: OCPICommandResultType,
    message?: OCPIDisplayText[],
    timeout?: number, // Not part of doc, added for some CPOs
}



// Custom types
export type OCPIStartSessionTokenWithInitiator= OCPIStartSession & {
    token: OCPITokenWithInitiator
}

export type OCPIStartSessionCustom = OCPIStartSession | OCPIStartSessionTokenWithInitiator;