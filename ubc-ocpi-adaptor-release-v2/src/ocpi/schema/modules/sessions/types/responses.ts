import { OCPISession, OCPIv211Session } from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";
import { OCPIChargingPreferencesResponse } from "../enums";

export type OCPISessionsResponse = OCPIResponsePayload & {
    data?: OCPISession[],
}

export type OCPISessionResponse = OCPIResponsePayload & {
    data?: OCPISession,
}

export type OCPIChargingPreferenceResponse = OCPIResponsePayload & {
    data?: OCPIChargingPreferencesResponse,
}

// #OCPIv2.1.1
export type OCPIv211SessionsResponse = OCPIResponsePayload & {
    data?: OCPIv211Session[],
}

export type OCPIv211SessionResponse = OCPIResponsePayload & {
    data?: OCPIv211Session,
}
