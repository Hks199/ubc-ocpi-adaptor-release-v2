import { OCPIAuthorizationInfo, OCPIToken, OCPIv211AuthorizationInfo, OCPIv211Token } from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";

export type OCPITokensResponse = OCPIResponsePayload & {
    data?: OCPIToken[],
}

export type OCPITokenResponse = OCPIResponsePayload & {
    data?: OCPIToken,
}

export type OCPIAuthorizationInfoResponse = OCPIResponsePayload & {
    data?: OCPIAuthorizationInfo,
}

// #OCPIv2.1.1
export type OCPIv211TokensResponse = OCPIResponsePayload & {
    data?: OCPIv211Token[],
}

export type OCPIv211TokenResponse = OCPIResponsePayload & {
    data?: OCPIv211Token,
}

export type OCPIv211AuthorizationInfoResponse = OCPIResponsePayload & {
    data?: OCPIv211AuthorizationInfo,
}
