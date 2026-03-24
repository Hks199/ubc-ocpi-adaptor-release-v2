export type UBCAckResponse = {
    transaction_id: string;
    timestamp: string;
    ack_status: "ACK" | "NACK";
};


export type AckResponsePayload = {
    message: {
        ack: {
            status: "ACK";
        }
    }
}

export type NackResponsePayload = {
    message: {
        ack: {
            status: "NACK";
        }
    }
}

export type BecknActionResponse = AckResponsePayload | NackResponsePayload;