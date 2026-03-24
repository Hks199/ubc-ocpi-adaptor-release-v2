import BecknLoggingService from "../ubc/services/BecknLoggingService";
import Utils from "./Utils";
import { Request } from 'express';


export default class OnixBppPreReqLogger {
    public static logRequest(
        req: Request,
    ): void {
        BecknLoggingService.log({
            reqId: (req.body as any)?.context?.message_id || Utils.generateRandomString(10),
            url: req.url,
            method: req.method,
            payload: req.body,
            headers: req.headers,
            action: 'bpp.in.request',
        });

    }
}
