import { URL } from "../../../general/types";
import { OCPIInterfaceRole, OCPIModuleID, OCPIVersionNumber } from "../enums";

// 6.1.2
export type OCPIVersionClass = {
    version: OCPIVersionNumber
    url: URL
}

// 6.2.2
export type OCPIEndpointClass = {
    identifier: OCPIModuleID
    role: OCPIInterfaceRole
    url: URL
}

// #OCPIv2.1.1 - 6.1.1
export type OCPIv211EndpointClass = {
    identifier: OCPIModuleID
    url: URL
}
