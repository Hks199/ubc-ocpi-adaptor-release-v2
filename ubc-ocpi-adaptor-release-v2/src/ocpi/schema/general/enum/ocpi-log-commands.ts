// eslint-disable import/prefer-default-export
export enum OCPICommands {
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

    // Credentials
    PostCredentialsReq = 'PostCredentialsReq',
    SendPostCredentialRes = 'SendPostCredentialRes',
    SendPostCredentialReq = 'SendPostCredentialReq',
    SendGetCredentialReq = 'SendGetCredentialReq',

    // Tariffs
    SendGetTariffRes = 'SendGetTariffRes',
    SendGetTariffReq = 'SendGetTariffReq',
    PutTariffRes = 'PutTariffRes',
    PutTariffReq = 'PutTariffReq',
    PostTariffRes = 'PostTariffRes',
    PostTariffReq = 'PostTariffReq',

    // Locations
    PutLocationReq = 'PutLocationReq',
    PutEVSEReq = 'PutEVSEReq',
    PutConnectorReq = 'PutConnectorReq',
    PostLocationRes = 'PostLocationRes',
    PostLocationReq = 'PostLocationReq',
    PatchLocationRes = 'PatchLocationRes',
    PatchLocationReq = 'PatchLocationReq',
    PatchEVSEReq = 'PatchEVSEReq',
    PatchConnectorReq = 'PatchConnectorReq',
    SendGetLocationRes = 'SendGetLocationRes',
    SendGetLocationReq = 'SendGetLocationReq',

    // Commands
    PostStartSessionCommand = 'PostStartSessionCommand',
    PostStopSessionCommand = 'PostStopSessionCommand',
    StopSessionPostCommandResultRes = 'StopSessionPostCommandResultRes',
    StopSessionPostCommandResultReq = 'StopSessionPostCommandResultReq',
    StartSessionPostCommandResultRes = 'StartSessionPostCommandResultRes',
    StartSessionPostCommandResultReq = 'StartSessionPostCommandResultReq',

    // Sessions
    SendStopSessionPostCommandRes = 'SendStopSessionPostCommandRes',
    SendStopSessionPostCommandReq = 'SendStopSessionPostCommandReq',
    SendStartSessionPostCommandRes = 'SendStartSessionPostCommandRes',
    SendStartSessionPostCommandReq = 'SendStartSessionPostCommandReq',
    SendGetSessionRes = 'SendGetSessionRes',
    SendGetSessionReq = 'SendGetSessionReq',
    PutSessionRes = 'PutSessionRes',
    PutSessionReq = 'PutSessionReq',
    PostSessionRes = 'PostSessionRes',
    PostSessionReq = 'PostSessionReq',
    PatchSessionRes = 'PatchSessionRes',
    PatchSessionReq = 'PatchSessionReq',

    // CDRs
    PostCdrRes = 'PostCdrRes',
    PostCdrReq = 'PostCdrReq',
    GetCdrsReq = 'GetCdrReq',
    GetCdrsRes = 'GetCdrRes',

    // Tokens
    PutTokenReq = 'PutTokenReq',
    PatchTokenReq = 'PatchTokenReq',
}
