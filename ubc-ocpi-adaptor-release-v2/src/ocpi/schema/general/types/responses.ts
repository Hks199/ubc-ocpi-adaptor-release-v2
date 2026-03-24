import { ISODateTime } from "../types";
import { OCPILocation } from "../../modules/locations/types";
import { OCPITariff } from "../../modules/tariffs/types";
import { OCPIResponseStatusCode, OCPIResponseStatusMessage } from "../enum";

export type OCPIResponsePayload<T = any> = {
    data?: T
    status_code: OCPIResponseStatusCode | number
    status_message?: string
    timestamp: ISODateTime
    status?: string,
    headers?: any,
}

export type OCPIOutgoingRequestResponse = {
    success: boolean,
    data?: any,
    message?: string,
    failure_reason?: OCPIResponseStatusCode,
    headers?: any,
    request?: {
        url?: string,
        method?: string,
        headers?: any,
    }
}

export type OCPIPutDataToEMSPResponse = {
    name?: string,
    databaseId?: string,
    ocpiObjectId?: string,
    success?: boolean,
    failureReason?: string,
    ocpiObject?: OCPITariff | OCPILocation,
    response?: OCPIOutgoingRequestResponse,
    message?: string,
}

export type OCPISendPutDataToEMSPResponse = {
    success: boolean,
    message?: string,
    emspOCPIClientId?: string,
    emspCountryCode?: string,
    emspPartyId?: string,
    ocpiDataSent?: OCPIPutDataToEMSPResponse[]  
    headers?: any,
}

export type OCPIHandleDataResponse = {
    ocpi_object_id: string,
    success: boolean,
    object_date_time?: string,
    failureReason?: OCPIResponseStatusMessage,
    message?: string,
    error?: string,
    data?: any,
}

export type OCPIGetAndHandleDataResponse = {
    success: boolean,
    message?: string,
    successes?: OCPIHandleDataResponse[],
    errors?: OCPIHandleDataResponse[],
    requestCount: number,
    error_response?: any,
}