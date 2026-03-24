import { OCPICredentials, OCPIv211Credentials} from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";

export type OCPICredentialsResponse = OCPIResponsePayload & {
    data?: OCPICredentials,
}

// #OCPIv2.1.1 
export type OCPIv211CredentialsResponse = OCPIResponsePayload & {
    data?: OCPIv211Credentials,
}