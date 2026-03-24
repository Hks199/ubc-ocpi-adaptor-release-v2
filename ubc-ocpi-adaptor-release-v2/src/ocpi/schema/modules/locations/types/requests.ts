import {
    OCPIConnector, OCPIEVSE, OCPILocation, OCPIPatchConnector, OCPIPatchEVSE, OCPIPatchLocation,
    OCPIv211Connector, OCPIv211EVSE, OCPIv211Location, OCPIv211PatchConnector, OCPIv211PatchEVSE, OCPIv211PatchLocation
} from ".";

export type OCPIPutLocationRequestPayload = OCPILocation;
export type OCPIPutEVSERequestPayload = OCPIEVSE;
export type OCPIPutConnectorRequestPayload = OCPIConnector;
export type OCPIPatchLocationRequestPayload = OCPIPatchLocation;
export type OCPIPatchEVSERequestPayload = OCPIPatchEVSE;
export type OCPIPatchConnectorRequestPayload = OCPIPatchConnector;

// #OCPIv2.1.1
export type OCPIv211PutLocationRequestPayload = OCPIv211Location;
export type OCPIv211PutEVSERequestPayload = OCPIv211EVSE;
export type OCPIv211PutConnectorRequestPayload = OCPIv211Connector;
export type OCPIv211PatchLocationRequestPayload = OCPIv211PatchLocation;
export type OCPIv211PatchEVSERequestPayload = OCPIv211PatchEVSE;
export type OCPIv211PatchConnectorRequestPayload = OCPIv211PatchConnector;

// #OCPIv2.2.1
// export type OCPIv221PutLocationRequestPayload = OCPIv211Location;
// export type OCPIv221PutEVSERequestPayload = OCPIv211EVSE;
// export type OCPIv221PutConnectorRequestPayload = OCPIv211Connector;
export type OCPIv221PatchLocationRequestPayload = OCPIv211PatchLocation;
export type OCPIv221PatchEVSERequestPayload = OCPIv211PatchEVSE;
export type OCPIv221PatchConnectorRequestPayload = OCPIv211PatchConnector;

