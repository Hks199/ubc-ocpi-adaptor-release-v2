import { OrderStatus } from "../../../enums/OrderStatus";

export type ExtractedOnConfirmResponsePayload = {
    order_status: OrderStatus,
    payment_received_at?: string,
};
