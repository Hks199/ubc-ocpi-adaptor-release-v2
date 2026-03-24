import { OCPIRole } from "../../../general/enum";
import CountryCode from "../../../general/enum/country-codes";
import { URL } from "../../../general/types";
import { OCPIBusinessDetailsClass } from "../../locations/types";


// 7.4.1
// Minimal OCPI 2.2.1 representation as used in the credentials examples:
// roles only contain country_code, party_id and role.
export type OCPICredentialsRoleClass = {
    country_code: CountryCode
    party_id: string
    role: OCPIRole,
    business_details?: OCPIBusinessDetailsClass
}

// 7.3.1
export type OCPICredentials = {
    token: string
    url: URL
    roles: OCPICredentialsRoleClass[]
}

// 7.3.1 PATCH /credentials – only token is allowed to be updated
export type OCPICredentialsPatchRequest = {
    token?: string
    url?: URL
    roles?: OCPICredentialsRoleClass[]
}

// #OCPIv2.1.1
// 7.2.1
export type OCPIv211Credentials = {
    token: string
    url: URL
    business_details: OCPIBusinessDetailsClass
    party_id: string
    country_code: CountryCode
}

