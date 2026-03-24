import { OCPIConnector, OCPIEVSE, OCPILocation, OCPIv211Connector, OCPIv211EVSE, OCPIv211Location } from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";

export type OCPILocationsResponse = OCPIResponsePayload<OCPILocation[]>;

export type OCPIEVSEsResponse = OCPIResponsePayload<OCPIEVSE[]>;

export type OCPIConnectorsResponse = OCPIResponsePayload<OCPIConnector[]>;

export type OCPILocationResponse = OCPIResponsePayload<OCPILocation>;

export type OCPIEVSEResponse = OCPIResponsePayload<OCPIEVSE>;

export type OCPIConnectorResponse = OCPIResponsePayload<OCPIConnector>;


// #OCPIv2.1.1
export type OCPIv211LocationsResponse = OCPIResponsePayload<OCPIv211Location[]>;

export type OCPIv211EVSEsResponse = OCPIResponsePayload<OCPIv211EVSE[]>;

export type OCPIv211ConnectorsResponse = OCPIResponsePayload<OCPIv211Connector[]>;

export type OCPIv211LocationResponse = OCPIResponsePayload<OCPIv211Location>;

export type OCPIv211EVSEResponse = OCPIResponsePayload<OCPIv211EVSE>;

export type OCPIv211ConnectorResponse = OCPIResponsePayload<OCPIv211Connector>;