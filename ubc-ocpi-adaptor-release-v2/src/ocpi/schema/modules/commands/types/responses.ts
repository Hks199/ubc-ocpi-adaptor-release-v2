import { OCPIDisplayText } from "../../../general/types";
import { OCPIResponsePayload } from "../../../general/types/responses";
import { OCPICommandResponseType, OCPIv211CommandResponseType } from "../enums";

// 13.3.2
export type OCPICommandResponse = {
    result: OCPICommandResponseType,
    timeout: bigint,
    message?: OCPIDisplayText[],
}

export type OCPICommandResponseResponse = OCPIResponsePayload & {
    data?: OCPICommandResponse,
}

// #OCPIv2.1.1
// 13.3.1
export type OCPIv211CommandResponse = {
    result: OCPIv211CommandResponseType,
}