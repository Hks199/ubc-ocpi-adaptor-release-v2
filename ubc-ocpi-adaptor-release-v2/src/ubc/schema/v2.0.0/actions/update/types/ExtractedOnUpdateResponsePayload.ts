import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";
import { BecknOrderValueResponse } from "../../../types/OrderValue";

export type ExtractedOnUpdateResponsePayload = {
    session_status: ChargingSessionStatus,
    order_value?: BecknOrderValueResponse,
};
