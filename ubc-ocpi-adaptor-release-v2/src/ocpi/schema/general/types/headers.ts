import { URL } from "./index";

export type OCPIPaginationResponseHeaders = {
    'X-Total-Count': number
    'X-Limit': number
    'Link': URL // pattern: <URL>; rel="next"
}

export type OCPIMessageRoutingHeaders = {
    'OCPI-to-party-id'?: string
    'OCPI-to-country-code'?: string
    'OCPI-from-party-id'?: string
    'OCPI-from-country- code'?: string
}

export type P2PRequestHeaders = {
    'X-Request-ID'?: string
}

export type HubRequestHeaders = P2PRequestHeaders & {
    'X-Correlation-ID'?: string
}

export type OCPIRequestHeaders = HubRequestHeaders & OCPIMessageRoutingHeaders & {
    Authorization?: string
};
