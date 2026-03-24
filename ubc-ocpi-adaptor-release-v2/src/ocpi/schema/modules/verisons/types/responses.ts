import { OCPIEndpointClass, OCPIVersionClass, OCPIv211EndpointClass } from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";
import { OCPIVersionNumber } from "../enums";

// 6.2.1
export type OCPIVersionDetailResponse = {
    version: OCPIVersionNumber
    endpoints: OCPIEndpointClass[]
}

// #OCPIv2.1.1 - 6.1
export type OCPIv211VersionDetailResponse = {
    version: OCPIVersionNumber
    endpoints: OCPIv211EndpointClass[]
}

export type OCPIVersionResponse = OCPIResponsePayload & {
    data?: OCPIVersionClass[],
}

export type OCPIGetVersionDetailResponse = OCPIResponsePayload & {
    data?: OCPIVersionDetailResponse,
}
