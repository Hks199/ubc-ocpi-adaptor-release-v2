import { OCPIChargingPreferences, OCPIPatchSession, OCPISession, OCPIv211PatchSession, OCPIv211Session} from ".";

export type OCPIPutSessionRequestPayload = OCPISession;

export type OCPIPatchSessionRequestPayload = OCPIPatchSession;

export type OCPIChargingPreferenceRequest = OCPIChargingPreferences;

// #OCPIv2.1.1
export type OCPIv211PatchSessionRequestPayload = OCPIv211PatchSession;

export type OCPIv211PutSessionRequestPayload = OCPIv211Session