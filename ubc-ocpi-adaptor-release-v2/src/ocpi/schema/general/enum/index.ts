// 16.5.1
export enum OCPIRole {
    CPO = 'CPO', // Charge Point Operator Role.
    EMSP = 'EMSP', // eMobility Service Provider Role.
    HUB = 'HUB', // Hub role.
    NAP = 'NAP', // National Access Point Role (national Database with all Location information of a country). NSP Navigation Service Provider Role, role like an eMSP(probably only interested in Location information). 
    OTHER = 'OTHER', // Other role.
    SCSP = 'SCSP', // Smart Charging Service Provider Role.
}


// 5.x
export enum OCPIResponseStatusCode {
    // 5.1. 1xxx: Success
    status_1000 = 1000,

    // 5.2. 2xxx: Client errors
    status_2000 = 2000,
    status_2001 = 2001,
    status_2002 = 2002,
    status_2003 = 2003,
    status_2004 = 2004,

    // Error codes for failed requests sent to external client
    BadHttpResponseFromClient = 2901, // Bad http response status from client
    NoResponseReceivedFromClient = 2902, // No response received from client

    // 5.3. 3xxx: Server errors
    status_3000 = 3000,
    status_3001 = 3001,
    status_3002 = 3002,
    status_3003 = 3003,
    ErrorSettingUpAxiosRequest = 3901, // Error in setting up request to client

    // 5.4. 4xxx: Hub errors
    status_4000 = 4000,
    status_4001 = 4001,
    status_4002 = 4002,
    status_4003 = 4003,
}

// #OCPIv2.1.1
// 4.x
export enum OCPIv211ResponseStatusCode {
    // 5.1. 1xxx: Success
    status_1000 = 1000,

    // 5.2. 2xxx: Client errors
    status_2000 = 2000,
    status_2001 = 2001,
    status_2002 = 2002,
    status_2003 = 2003,

    // 5.3. 3xxx: Server errors
    status_3000 = 3000,
    status_3001 = 3001,
    status_3002 = 3002,
    status_3003 = 3003,

    // 5.4. 4xxx: Hub errors
    status_4000 = 4000,
    status_4001 = 4001,
    status_4002 = 4002,
    status_4003 = 4003,
}


export enum ChargePointErrorCode {
    ConnectorLockFailure = 'ConnectorLockFailure',
    EVCommunicationError = 'EVCommunicationError',
    GroundFailure = 'GroundFailure',
    HighTemperature = 'HighTemperature',
    InternalError = 'InternalError',
    LocalListConflict = 'LocalListConflict',
    NoError = 'NoError',
    OtherError = 'OtherError',
    OverCurrentFailure = 'OverCurrentFailure',
    OverVoltage = 'OverVoltage',
    PowerMeterFailure = 'PowerMeterFailure',
    PowerSwitchFailure = 'PowerSwitchFailure',
    ReaderFailure = 'ReaderFailure',
    ResetFailure = 'ResetFailure',
    UnderVoltage = 'UnderVoltage',
    WeakSignal = 'WeakSignal'
};


export enum OCPIResponseStatusMessage {
    AlreadyRegistered = 'Platform already Registered. Use PUT method instead',
    AuthReferenceRequired = 'authorization_reference is required',
    BillNotAssociated = 'Session in the request payload does not have a bill associated with it',
    CDRAlreadyAdded = 'CDR already added',
    CDRNotFound = 'CDR Not Found',
    CountryCodeMismatch = 'Country code in the request payload does not match the country code in the request URL',
    EndpointNotFound = 'Endpoint not found',
    EVSEConnectorMismatch = 'EVSE Connector Id in the request payload does not match the EVSE Connector Id in the request URL',
    EVSEConnectorNotFound = 'EVSE Connector not found',
    EVSEMismatch = 'EVSE UID in the request payload does not match the EVSE UID in the request URL',
    EVSENotFound = 'EVSE not found',
    FailedToAddConnector = 'Failed to add Connector',
    FailedToAddEVSE = 'Failed to add EVSE',
    FailedToAddLocation = 'Failed to add Location',
    FailedToAddSession = 'Failed to add Session',
    FailedToAddTariff = 'Failed to add Tariff',
    FailedToUpdateConnector = 'Failed to update Connector',
    FailedToUpdateEVSE = 'Failed to update EVSE',
    FailedToUpdateLocation = 'Failed to update Location',
    FailedToUpdateSession = 'Failed to update Session',
    FailedToUpdateTariff = 'Failed to update Tariff',
    GenericServerError = 'Generic server error',
    InvalidParameterReqPayload = 'Invalid parameter in the request payload',
    InvalidResponseFromCDRURL = 'Invalid response from cdrs URL',
    InvalidResponseFromLocationURL = 'Invalid response from locations URL',
    InvalidResponseFromSessionURL = 'Invalid response from sessions URL',
    InvalidResponseFromTariffURL = 'Invalid response from tariffs URL',
    InvalidResponseFromVersionURL = 'Invalid response from version URL',
    InvalidSchema = 'Invalid Schema',
    IsNotRegistered = 'Platform is not registered. Use POST method instead',
    LocationMismatch = 'Location in the request payload does not match the location in the request URL',
    LocationNotFound = 'Location not found',
    PartyMismatch = 'Party in the request payload does not match the party in the request URL',
    PartyNotFound = 'Party not found',
    CPOPartyNotFound = 'CPO Party not found',
    EMSPPartyNotFound = 'EMSP Party not found',
    EMSPUserNotFound = 'EMSP User not found',
    SessionFieldIsRequired = 'Session field is required',
    SessionMisMatch = 'Session in the request payload does not match the session in the request URL',
    SessionNotFound = 'Session not found',
    Success = 'Success',
    TariffMismatch = 'Tariff in the request payload does not match the tariff in the request URL',
    TariffNotFound = 'Tariff not found',
    NoTariffsFound = 'No tariffs found',
    TokenNotFound = 'Token not found',
    Unauthorized = 'Unauthorized',
    VersionMatchNotFound = 'OCPI version not found',
    CommandNotSupported = 'Command not supported',
    CommandNotRecognized = 'Command not recognized',
    FailedRequest = 'Failed request to external OCPI party',
    NoLocationsEnabled = 'No Locations Enabled for OCPI Client',
    OCPIPlatformNotFound = 'OCPI Platform Not Found',
    OCPIClientNotFound = 'OCPI Client not found',
    NoTariffsEnabled = 'No Tariffs Enabled for OCPI Client',
    MissingOCPIProperties = 'Data in database is missing required properties for OCPI, e.g. the ocpi_object_id',
    ModuleNotEnabled = 'Module not enabled',
    SessionAlreadyStopped = 'Session already stopped',
    SessionAlreadyStarted = 'Session already started',
}

// Explanation: https://docs.google.com/spreadsheets/d/167wM04jz_xz7LYdB9jgx2uhers5TvoIfS87FylvoTr0/edit?usp=sharing
export enum OCPICredentialsTokenType {
    Incoming = 'Incoming',
    Outgoing = 'Outgoing',
    IncomingRegistration = 'IncomingRegistration',
    OutgoingRegistration = 'OutgoingRegistration',
}

export enum OCPIPlatformStatus {
    New = 'New',
    Registered = 'Registered',
    Unregistered = 'Unregistered',
    IssuesIdentified = 'Issues Identified',
}

export enum OCPISessionStage {
    Unknown = 0,
    StartSessionRequested = 1,
    StartSessionAccepted = 2,
    StartSessionCommandResultAccepted = 3,
    StopSessionRequested = 4,
    StopSessionAccepted = 5,
    StopSessionCommandResultAccepted = 6,
    StartSessionCommandResultRejected = 7,
    StopSessionCommandResultRejected = 8,

    /**
     * Additional stages added for OCPI as eMSP.
     * This is to help track what was sent and received for auditing/debugging.
     */

    // Handling unexpected EVSE Available status
    EVSEAvailable_ChTxnNotStarted = 20,
    EVSEAvailable_ChTxnOngoing = 21,
    PatchSessionReceived_ChTxnPending = 22,
   
    /**
     * Additional stages and detail added for OCPI for CPOs.
     * This is to help track what was sent and received for auditing/debugging.
     * More details are in ocpi_logs.
     */

    // Not tracked in chargeTransaction as these stages occur before charge transaction is created /*
    StartSessionIncomingReqReceived = 100,
    StartSessionOutgoingResSent_Accepted = 101,
    StartSessionOutgoingResSent_Rejected = 102,
    // Not tracked in chargeTransaction */

    StartSessionResultSent_Accepted = 103,
    StartSessionResultSent_Rejected = 104,
    StartSessionResultReqFailed = 105,
    StartSessionResultReceived_Success = 106,
    StartSessionResultReceived_Failed = 107,

    PutSessionSent = 110,
    PutSessionReqFailed = 111,
    PutSessionReceived_Success = 112,
    PutSessionReceived_Failed = 113,

    StopSessionIncomingReqReceived = 120,
    StopSessionOutgoingResSent_Accepted = 121,
    StopSessionOutgoingResSent_Rejected = 122,

    StopSessionResultSent_Accepted = 123,
    StopSessionResultSent_Rejected = 124,
    StopSessionResultReqFailed = 125,
    StopSessionResultReceived_Success = 126,
    StopSessionResultReceived_Failed = 127,

    StopSessionCommandReceived = 128,

    PatchCompletedSessionSent = 130,
    PatchCompletedSessionReqFailed = 131,
    PatchCompletedSessionReceived_Success = 132,
    PatchCompletedSessionReceived_Failed = 133,

    PostCdrSent = 140,
    PostCdrReqFailed = 141,
    PostCdrReceived_Success = 142,
    PostCdrReceived_Fail = 143,

    GetCdrReqReceived = 150,
    GetCdrResSent = 152,
    GetCdrResError = 153,

    SessionMarkedAsInvalid = 999,
}

export enum OCPIOutgoingRequestMethods {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE'
}

export enum OCPIOutgoingRequestFailureReason {
    StatusNot2XX = 'StatusNot2XX',
    NoResponseReceived = 'NoResponseReceived',
    Unknown = 'Unknown',
}

export enum OCPIUniqueIdTypes {
    LocationId = 'LocationId',
    EVSEUid = 'EVSEUid',
    TariffId = 'TariffId',
    CrdId = 'CdrId',
    SessionId = 'SessionId',
}

export enum OCPIClientPartnershipStatus {
    Active = "10",
    Inactive = "20",
}

export enum OCPIClientStatus {
    Active = "10",
    Inactive = "20",
    Deleted = "30",
}

export enum OCPICustomizations {
    /**
     * Add initiated_by and initiator_name to start_charging_command.token
     */
    add_initiator_to_start_charging = 'add_initiator_to_start_charging',

    /**
     * Send Charging status for Preparing 
     */
    send_charging_for_preparing = 'send_charging_for_preparing'
}

export enum OCPICommunicationChannel {
    whatsapp_group = 'whatsapp_group',
    mail_chain = 'mail_chain',
}
