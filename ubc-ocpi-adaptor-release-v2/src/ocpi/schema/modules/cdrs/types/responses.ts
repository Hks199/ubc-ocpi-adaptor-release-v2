import { OCPICDR, OCPIv211CDR } from ".";
import { OCPIResponseStatusMessage } from "../../../general/enum";
import { OCPIPrice } from "../../../general/types";
import { OCPIResponsePayload } from "../../../general/types/responses";

export type OCPICDRsResponse = OCPIResponsePayload & {
    data?: OCPICDR[],
}

export type OCPICDRResponse = OCPIResponsePayload & {
    data?: OCPICDR,
}

// #OCPIv2.1.1
export type OCPIv211CDRsResponse = OCPIResponsePayload & {
    data?: OCPIv211CDR[],
}

export type OCPIv211CDRResponse = OCPIResponsePayload & {
    data?: OCPIv211CDR,
}



// Handle CDR Function response
export type OCPIHandleCDRResponse = {
    cdr_id: string,
    success: boolean,
    end_date_time?: string,
    failureReason?: OCPIResponseStatusMessage,
    message?: string,
    error?: string,
    data?: {
        session_id?: string,
        cdr_received?: any,
        total_cost?: OCPIPrice,
        error_response?: any,
    }
}

export type OCPIGetAndHandleCDRResponse = {
    success: boolean,
    message?: string,
    cdrStatus?: OCPIHandleCDRResponse[],
    cdrErrors?: OCPIHandleCDRResponse[],
    requestCount: number,
    error_response?: any,
}