import { ISODateTime, OCPIDisplayText } from "../../../general/types";
import { OCPIProfileType } from "../../sessions/enums";
import { OCPIAllowedType, OCPITokenType, OCPIWhitelistType, OCPIv211Allowed, OCPIv211TokenType } from "../enums";

// 12.4.2
export type OCPIEnergyContract = {
    supplier_name: string,
    contract_id?: string,
}

// 12.4.3
export type OCPILocationReferences = {
    location_id: string,
    evse_uids?: string[],
}

// #OCPIv2.1.1
// 12.4.2
export type OCPIv211LocationReferences = {
    location_id: string,
    evse_uids?: string[],
    connector_ids?: string[],
}

// 12.3.2
export type OCPIToken = {
    country_code: string,
    party_id: string,
    uid: string,
    type: OCPITokenType,
    contract_id: string,
    visual_number?: string,
    issuer: string,
    group_id?: string,
    valid: boolean,
    whitelist: OCPIWhitelistType,
    language?: string,
    default_profile_type?: OCPIProfileType,
    energy_contract?: OCPIEnergyContract,
    last_updated: ISODateTime,
}

// #OCPIv2.1.1
// 12.3.2
export type OCPIv211Token = {
    uid: string,
    type: OCPIv211TokenType,
    auth_id: string,
    visual_number?: string,
    issuer: string,
    valid: boolean,
    whitelist: OCPIWhitelistType,
    language?: string,
    last_updated: ISODateTime,
}

// 12.3.1
export type OCPIAuthorizationInfo = {
    allowed: OCPIAllowedType,
    token: OCPIToken,
    location?: OCPILocationReferences,
    authorization_references?: string,
    info?: OCPIDisplayText,
    cache_until?: ISODateTime, // Optional: tells CPO how long to cache this authorization decision
}

// #OCPIv2.1.1
// 12.3.1
export type OCPIv211AuthorizationInfo = {
    allowed: OCPIv211Allowed,
    location?: OCPIv211LocationReferences,
    info?: OCPIDisplayText,
}


// OCPI For CPOs
export type OCPIPatchToken = Partial<OCPIToken>


// Custom types
export type OCPITokenWithInitiator = OCPIToken & {
    initiated_by?: string,
}