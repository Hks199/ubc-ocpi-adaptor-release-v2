import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";
import { BecknOrderValueResponse } from "../../../types/OrderValue";

export type ExtractedOnUpdateRequestBody = {
    beckn_order_id: string,
    session_status: ChargingSessionStatus,
    beckn_transaction_id: string,
    order_value?: BecknOrderValueResponse,
};
