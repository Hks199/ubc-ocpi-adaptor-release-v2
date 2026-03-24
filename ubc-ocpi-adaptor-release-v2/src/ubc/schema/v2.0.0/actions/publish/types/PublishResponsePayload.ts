export type UBCPublishResponsePayload = {
    "transaction_id": string;
    "timestamp": string;
    "ack_status": "ACK" | "NACK";
}