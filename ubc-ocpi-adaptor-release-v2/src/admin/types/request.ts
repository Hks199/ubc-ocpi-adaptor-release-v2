import { OCPIToken } from "../../ocpi/schema/modules/tokens/types";

export type AdminRegisterRequestPayload = {
    cpo_auth_token: string;
    cpo_versions_url: string;
    cpo_party_id: string;
    cpo_country_code: string;
    cpo_name: string;
    cpo_token: OCPIToken;

    emsp_auth_token?: string;
    emsp_ocpi_host?: string; // Required for first time registration
    emsp_party_id?: string; // Required for first time registration
    emsp_country_code?: string; // Required for first time registration
    emsp_name?: string; // Required for first time registration
}