// 6.2.3
export enum OCPIInterfaceRole {
    Sender = 'SENDER',
    Receiver = 'RECEIVER',
}

// 6.2.4
export enum OCPIModuleID {
    // Additional, not in doc
    Versions = 'versions',

    CDRs = 'cdrs',
    ChargingProfiles = 'chargingprofiles',
    Commands = 'commands',
    CredentialsAndRegistration = 'credentials',
    HubClientInfo = 'hubclientinfo',
    Locations = 'locations',
    Sessions = 'sessions',
    Tariffs = 'tariffs',
    Tokens = 'tokens',
}

// 6.2.5
export enum OCPIVersionNumber {
    v2_0 = '2.0',
    /**
     * @deprecated
     */
    v2_1 = '2.1',
    v2_1_1 = '2.1.1',
    /**
     * @deprecated
     */
    v2_2 = '2.2',
    v2_2_1 = '2.2.1',
}
