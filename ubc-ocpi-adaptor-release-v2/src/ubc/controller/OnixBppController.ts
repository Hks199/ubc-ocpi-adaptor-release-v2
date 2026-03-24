/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "../../services/logger.service";
import { HttpResponse } from "../../types/responses";
import Utils from "../../utils/Utils";
import { BecknAction } from "../schema/v2.0.0/enums/BecknAction";
import { BecknActionResponse } from "../schema/v2.0.0/types/AckResponse";
import UBCResponseService from "../services/UBCResponseService";
import { Request } from "express";

/**
 * This is a common controller for BPP requests from all domains.
 * The routing of the domain has to be done within this
 */
export default class OnixBppController {
    public static async requestWrapper(action: BecknAction, reqDetails: Request, fn: (req: Request) => void): Promise<HttpResponse<BecknActionResponse>> {
        try {
            logger.debug(`🟡 Received request in requestWrapper for action ${action}`, { data: reqDetails });

            // Skip domain check for publish actions (publish/on_publish) as they don't include domain in request payload
            const isPublishAction = action === BecknAction.publish || action === BecknAction.on_publish;
            
            if (isPublishAction || Utils.isUBCDomain(reqDetails)) {
                // Return ACK first, then execute the function asynchronously after response is sent
                const ackResponse = UBCResponseService.ack();
                // Use setImmediate to ensure response is sent first, then execute async function
                setImmediate(() => {
                    Utils.executeAsync(() => fn(reqDetails));
                });
                return ackResponse;
            }

            logger.error(`🔴 Error in requestWrapper for action ${action}: 'Unsupported domain'`);

            return UBCResponseService.nack();
        }
        catch (e: any) {
            logger.error(`🔴 Error in requestWrapper for action ${action}: 'Something went wrong'`, e);

            return UBCResponseService.nack();
        }
    }
}