import { ChargingAction } from "../../../enums/ChargingAction";
import { BecknRequestMetadata } from "../../select/types/ExtractedSelectRequestBody";

export type ExtractedUpdateRequestPayload = {
    charging_action: ChargingAction,
    beckn_order_id: string,
    charge_point_connector_id: string,
};

export type ExtractedUpdateRequestBody = {
    metadata: BecknRequestMetadata,
    payload: ExtractedUpdateRequestPayload,
}
