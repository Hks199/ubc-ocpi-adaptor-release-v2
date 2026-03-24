// OCPI Common Types

export interface OCPIResponse<T> {
    status_code: number;
    status_message?: string;
    data?: T;
    timestamp?: string;
}

export interface OCPIEndpoint {
    identifier: string;
    role: 'SENDER' | 'RECEIVER';
    url: string;
}

export interface OCPICredentials {
    token: string;
    url: string;
    business_details: {
        name: string;
        logo?: {
            url: string;
            thumbnail?: string;
            category?: string;
            type?: string;
            width?: number;
            height?: number;
        };
    };
    party_id: string;
    country_code: string;
}

export interface OCPIVersion {
    version: string;
    url: string;
}

// Location Types
export interface OCPILocation {
    id: string;
    type: 'ON_STREET' | 'PARKING_GARAGE' | 'PARKING_LOT' | 'UNDERGROUND_GARAGE' | 'OTHER';
    name?: string;
    address: string;
    city: string;
    postal_code: string;
    country: string;
    coordinates: {
        latitude: string;
        longitude: string;
    };
    related_locations?: OCPILocation[];
    evses?: OCPIEVSE[];
    directions?: Array<{
        language: string;
        text: string;
    }>;
    operator?: {
        name: string;
        website?: string;
    };
    suboperator?: {
        name: string;
        website?: string;
    };
    owner?: {
        name: string;
        website?: string;
    };
    facilities?: string[];
    time_zone: string;
    opening_times?: {
        regular_hours?: Array<{
            weekday: number;
            period_begin: string;
            period_end: string;
        }>;
        twenty_four_seven: boolean;
        exceptional_openings?: Array<{
            period_begin: string;
            period_end: string;
        }>;
        exceptional_closings?: Array<{
            period_begin: string;
            period_end: string;
        }>;
    };
    charging_when_closed?: boolean;
    images?: Array<{
        url: string;
        thumbnail?: string;
        category: string;
        type: string;
        width?: number;
        height?: number;
    }>;
    energy_mix?: {
        is_green_energy: boolean;
        energy_sources?: Array<{
            source: string;
            percentage: number;
        }>;
        environ_impact?: Array<{
            category: string;
            amount: number;
            type?: string;
        }>;
        supplier_name?: string;
        energy_product_name?: string;
    };
    last_updated: string;
}

export interface OCPIEVSE {
    uid: string;
    evse_id?: string;
    status:
        | 'AVAILABLE'
        | 'BLOCKED'
        | 'CHARGING'
        | 'INOPERATIVE'
        | 'OUT_OF_ORDER'
        | 'PLANNED'
        | 'REMOVED'
        | 'RESERVED'
        | 'UNKNOWN';
    status_schedule?: Array<{
        period_begin: string;
        period_end?: string;
        status: string;
    }>;
    capabilities?: string[];
    connectors: OCPIConnector[];
    floor_level?: string;
    coordinates?: {
        latitude: string;
        longitude: string;
    };
    physical_reference?: string;
    directions?: Array<{
        language: string;
        text: string;
    }>;
    parking_restrictions?: string[];
    images?: Array<{
        url: string;
        thumbnail?: string;
        category: string;
        type: string;
        width?: number;
        height?: number;
    }>;
    last_updated: string;
}

export interface OCPIConnector {
    id: string;
    standard: string;
    format: 'SOCKET' | 'CABLE';
    power_type: 'AC_1_PHASE' | 'AC_3_PHASE' | 'DC';
    voltage?: number;
    amperage?: number;
    tariff_id?: string;
    terms_and_conditions?: string;
    last_updated: string;
}

// Tariff Types
export interface OCPITariff {
    country_code: string;
    party_id: string;
    id: string;
    currency: string;
    type: 'AD_HOC_PAYMENT' | 'PROFILE_CHEAPEST' | 'PROFILE_FASTEST' | 'REGULAR';
    tariff_alt_text?: Array<{
        language: string;
        text: string;
    }>;
    tariff_alt_url?: string;
    min_price?: {
        excl_vat: number;
        incl_vat: number;
    };
    max_price?: {
        excl_vat: number;
        incl_vat: number;
    };
    elements: OCPITariffElement[];
    start_date_time?: string;
    end_date_time?: string;
    energy_mix?: {
        is_green_energy: boolean;
        energy_sources?: Array<{
            source: string;
            percentage: number;
        }>;
        environ_impact?: Array<{
            category: string;
            amount: number;
            type?: string;
        }>;
        supplier_name?: string;
        energy_product_name?: string;
    };
    last_updated: string;
}

export interface OCPITariffElement {
    price_components: OCPIPriceComponent[];
    restrictions?: OCPITariffRestriction;
}

export interface OCPIPriceComponent {
    type: 'ENERGY' | 'FLAT' | 'PARKING_TIME' | 'TIME';
    price: number;
    vat?: number;
    step_size?: number;
}

export interface OCPITariffRestriction {
    start_time?: string;
    end_time?: string;
    start_date?: string;
    end_date?: string;
    min_kwh?: number;
    max_kwh?: number;
    min_current?: number;
    max_current?: number;
    min_power?: number;
    max_power?: number;
    min_duration?: number;
    max_duration?: number;
    day_of_week?: string[];
    reservation?: 'RESERVATION' | 'RESERVATION_EXPIRES';
}

// Session Types
export interface OCPISession {
    id: string;
    start_date_time: string;
    end_date_time?: string;
    kwh: number;
    auth_id: string;
    auth_method: 'AUTH_REQUEST' | 'COMMAND' | 'WHITELIST';
    location: {
        id: string;
        name?: string;
        address?: string;
        city?: string;
        postal_code?: string;
        country: string;
        coordinates?: {
            latitude: string;
            longitude: string;
        };
        evse?: {
            uid: string;
            evse_id?: string;
            connector_id?: string;
        };
    };
    meter_id?: string;
    currency: string;
    charging_periods?: Array<{
        start_date_time: string;
        dimensions: Array<{
            type: string;
            volume: number;
        }>;
        tariff_id?: string;
    }>;
    total_cost?: number;
    status: 'ACTIVE' | 'COMPLETED' | 'INVALID' | 'PENDING';
    last_updated: string;
}

// CDR Types
export interface OCPICDR {
    id: string;
    start_date_time: string;
    end_date_time: string;
    auth_id: string;
    auth_method: 'AUTH_REQUEST' | 'COMMAND' | 'WHITELIST';
    location: {
        id: string;
        name?: string;
        address?: string;
        city?: string;
        postal_code?: string;
        country: string;
        coordinates?: {
            latitude: string;
            longitude: string;
        };
        evse?: {
            uid: string;
            evse_id?: string;
            connector_id?: string;
        };
    };
    meter_id?: string;
    currency: string;
    tariffs?: Array<{
        country_code: string;
        party_id: string;
        id: string;
        name?: string;
        url?: string;
        type: string;
        tariff_alt_text?: Array<{
            language: string;
            text: string;
        }>;
        tariff_alt_url?: string;
        min_price?: {
            excl_vat: number;
            incl_vat: number;
        };
        max_price?: {
            excl_vat: number;
            incl_vat: number;
        };
        elements: OCPITariffElement[];
        start_date_time?: string;
        end_date_time?: string;
        energy_mix?: {
            is_green_energy: boolean;
            energy_sources?: Array<{
                source: string;
                percentage: number;
            }>;
            environ_impact?: Array<{
                category: string;
                amount: number;
                type?: string;
            }>;
            supplier_name?: string;
            energy_product_name?: string;
        };
        last_updated: string;
    }>;
    charging_periods: Array<{
        start_date_time: string;
        dimensions: Array<{
            type: string;
            volume: number;
        }>;
        tariff_id?: string;
    }>;
    total_cost: {
        excl_vat: number;
        incl_vat: number;
    };
    total_energy: number;
    total_time?: number;
    total_parking_time?: number;
    remark?: string;
    credit?: boolean;
    credit_reference_id?: string;
    invoice_reference_id?: string;
    last_updated: string;
}

// Token Types
export interface OCPIToken {
    uid: string;
    type: 'AD_HOC_USER' | 'APP_USER' | 'OTHER' | 'RFID';
    auth_id: string;
    issuer: string;
    valid: boolean;
    whitelist: 'ALWAYS' | 'ALLOWED' | 'ALLOWED_OFFLINE' | 'NEVER';
    language?: string;
    last_updated: string;
}

// Command Types
export type OCPICommand = 'START_SESSION' | 'STOP_SESSION' | 'RESERVE_NOW' | 'CANCEL_RESERVATION';

export interface OCPICommandResponse {
    result: 'ACCEPTED' | 'UNKNOWN_LOCATION' | 'REJECTED';
    timeout?: number;
    message?: string;
}

export enum OCPILogCommand {
    // Generic
    SendGetRes = 'SendGetRes',
    SendGetReq = 'SendGetReq',

    // Versions
    GetVersionRes = 'GetVersionRes',
    GetVersionReq = 'GetVersionReq',
    GetVersionDetailsRes = 'GetVersionDetailsRes',
    GetVersionDetailsReq = 'GetVersionDetailsReq',
    GetSessionRes = 'GetSessionRes',
    GetSessionReq = 'GetSessionReq',
    SendGetVersionRes = 'SendGetVersionRes',
    SendGetVersionReq = 'SendGetVersionReq',
    SendGetVersionDetailsReq = 'SendGetVersionDetailsReq',
    SendGetVersionDetailsRes = 'SendGetVersionDetailsRes',

    // Credentials
    PostCredentialsReq = 'PostCredentialsReq',
    PostCredentialsRes = 'PostCredentialsRes',
    GetCredentialsReq = 'GetCredentialsReq',
    GetCredentialsRes = 'GetCredentialsRes',
    PutCredentialsReq = 'PutCredentialsReq',
    PutCredentialsRes = 'PutCredentialsRes',
    PatchCredentialsReq = 'PatchCredentialsReq',
    PatchCredentialsRes = 'PatchCredentialsRes',
    SendPostCredentialRes = 'SendPostCredentialRes',
    SendPostCredentialReq = 'SendPostCredentialReq',
    SendGetCredentialReq = 'SendGetCredentialReq',
    SendGetCredentialRes = 'SendGetCredentialRes',
    SendPostCredentialsReq = 'SendPostCredentialsReq',
    SendPostCredentialsRes = 'SendPostCredentialsRes',
    SendGetCredentialsReq = 'SendGetCredentialsReq',
    SendGetCredentialsRes = 'SendGetCredentialsRes',

    // Tariffs
    GetTariffsReq = 'GetTariffsReq',
    GetTariffsRes = 'GetTariffsRes',
    GetTariffReq = 'GetTariffReq',
    GetTariffRes = 'GetTariffRes',
    SendGetTariffRes = 'SendGetTariffRes',
    SendGetTariffReq = 'SendGetTariffReq',
    SendGetTariffsReq = 'SendGetTariffsReq',
    SendGetTariffsRes = 'SendGetTariffsRes',
    PutTariffRes = 'PutTariffRes',
    PutTariffReq = 'PutTariffReq',
    PatchTariffReq = 'PatchTariffReq',
    PatchTariffRes = 'PatchTariffRes',
    DeleteTariffReq = 'DeleteTariffReq',
    DeleteTariffRes = 'DeleteTariffRes',
    PostTariffRes = 'PostTariffRes',
    PostTariffReq = 'PostTariffReq',

    // Locations
    GetLocationsReq = 'GetLocationsReq',
    GetLocationsRes = 'GetLocationsRes',
    GetLocationReq = 'GetLocationReq',
    GetLocationRes = 'GetLocationRes',
    GetEVSEReq = 'GetEVSEReq',
    GetEVSERes = 'GetEVSERes',
    GetConnectorReq = 'GetConnectorReq',
    GetConnectorRes = 'GetConnectorRes',
    PutLocationReq = 'PutLocationReq',
    PutLocationRes = 'PutLocationRes',
    PutEVSEReq = 'PutEVSEReq',
    PutEVSERes = 'PutEVSERes',
    PutConnectorReq = 'PutConnectorReq',
    PutConnectorRes = 'PutConnectorRes',
    PostLocationRes = 'PostLocationRes',
    PostLocationReq = 'PostLocationReq',
    PatchLocationRes = 'PatchLocationRes',
    PatchLocationReq = 'PatchLocationReq',
    PatchEVSEReq = 'PatchEVSEReq',
    PatchEVSERes = 'PatchEVSERes',
    PatchConnectorReq = 'PatchConnectorReq',
    PatchConnectorRes = 'PatchConnectorRes',
    SendGetLocationRes = 'SendGetLocationRes',
    SendGetLocationReq = 'SendGetLocationReq',
    SendGetLocationOneReq = 'SendGetLocationOneReq',
    SendGetLocationOneRes = 'SendGetLocationOneRes',

    // Commands
    PostStartSessionCommand = 'PostStartSessionCommand',
    PostStopSessionCommand = 'PostStopSessionCommand',
    PostCommandResultReq = 'PostCommandResultReq',
    PostCommandResultRes = 'PostCommandResultRes',
    StopSessionPostCommandResultRes = 'StopSessionPostCommandResultRes',
    StopSessionPostCommandResultReq = 'StopSessionPostCommandResultReq',
    StartSessionPostCommandResultRes = 'StartSessionPostCommandResultRes',
    StartSessionPostCommandResultReq = 'StartSessionPostCommandResultReq',

    // Sessions
    GetSessionsReq = 'GetSessionsReq',
    GetSessionsRes = 'GetSessionsRes',
    SendStopSessionPostCommandRes = 'SendStopSessionPostCommandRes',
    SendStopSessionPostCommandReq = 'SendStopSessionPostCommandReq',
    SendStartSessionPostCommandRes = 'SendStartSessionPostCommandRes',
    SendStartSessionPostCommandReq = 'SendStartSessionPostCommandReq',
    SendGetSessionRes = 'SendGetSessionRes',
    SendGetSessionReq = 'SendGetSessionReq',
    SendGetSessionsReq = 'SendGetSessionsReq',
    SendGetSessionsRes = 'SendGetSessionsRes',
    SendGetSessionOneReq = 'SendGetSessionOneReq',
    SendGetSessionOneRes = 'SendGetSessionOneRes',
    SendPutSessionReq = 'SendPutSessionReq',
    SendPutSessionRes = 'SendPutSessionRes',
    SendPatchSessionReq = 'SendPatchSessionReq',
    SendPatchSessionRes = 'SendPatchSessionRes',
    PutSessionRes = 'PutSessionRes',
    PutSessionReq = 'PutSessionReq',
    PostSessionRes = 'PostSessionRes',
    PostSessionReq = 'PostSessionReq',
    PatchSessionRes = 'PatchSessionRes',
    PatchSessionReq = 'PatchSessionReq',

    // CDRs
    GetCdrsReq = 'GetCdrsReq',
    GetCdrsRes = 'GetCdrsRes',
    GetCdrReq = 'GetCdrReq',
    GetCdrRes = 'GetCdrRes',
    PostCdrRes = 'PostCdrRes',
    PostCdrReq = 'PostCdrReq',
    SendGetCdrsReq = 'SendGetCdrsReq',
    SendGetCdrsRes = 'SendGetCdrsRes',
    SendGetCdrReq = 'SendGetCdrReq',
    SendGetCdrRes = 'SendGetCdrRes',
    SendPostCdrReq = 'SendPostCdrReq',
    SendPostCdrRes = 'SendPostCdrRes',

    // Tokens
    GetTokensReq = 'GetTokensReq',
    GetTokensRes = 'GetTokensRes',
    GetTokenReq = 'GetTokenReq',
    GetTokenRes = 'GetTokenRes',
    PutTokenReq = 'PutTokenReq',
    PutTokenRes = 'PutTokenRes',
    PatchTokenReq = 'PatchTokenReq',
    PatchTokenRes = 'PatchTokenRes',
    PostAuthorizeTokenReq = 'PostAuthorizeTokenReq',
    PostAuthorizeTokenRes = 'PostAuthorizeTokenRes',
    SendGetTokensReq = 'SendGetTokensReq',
    SendGetTokensRes = 'SendGetTokensRes',
    SendGetTokenReq = 'SendGetTokenReq',
    SendGetTokenRes = 'SendGetTokenRes',
    SendPutTokenReq = 'SendPutTokenReq',
    SendPutTokenRes = 'SendPutTokenRes',
    SendPutTokenDirectReq = 'SendPutTokenDirectReq',
    SendPutTokenDirectRes = 'SendPutTokenDirectRes',
    SendPatchTokenReq = 'SendPatchTokenReq',
    SendPatchTokenRes = 'SendPatchTokenRes',
    SendPostAuthorizeTokenReq = 'SendPostAuthorizeTokenReq',
    SendPostAuthorizeTokenRes = 'SendPostAuthorizeTokenRes',
}
