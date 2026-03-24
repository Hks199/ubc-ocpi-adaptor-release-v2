import { HttpResponse } from "../../types/responses";
import { AckResponsePayload, NackResponsePayload } from "../schema/v2.0.0/types/AckResponse";

export default class UBCResponseService {
    /**
     * Returns an ACK response
     */
    public static ack(): HttpResponse<AckResponsePayload> {
        return {
            httpStatus: 200,
            payload: {
                message: {
                    ack: {
                        status: "ACK",
                    },
                },
            },
        };
    }

    /**
     * Returns a NACK response
     */
    public static nack(): HttpResponse<NackResponsePayload> {
        return {
            httpStatus: 200,
            payload: {
                message: {
                    ack: {
                        status: "NACK",
                    },
                },
            },
        };
    }
}

