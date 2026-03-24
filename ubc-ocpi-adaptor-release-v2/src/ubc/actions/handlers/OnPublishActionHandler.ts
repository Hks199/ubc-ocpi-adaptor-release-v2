import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import OnixBppController from '../../controller/OnixBppController';
import RequestsStoreService from '../../../utils/RequestsStoreService';

/**
 * Handler for on_publish (on_catalog_publish) callback from CDS
 * - Immediately returns ACK to CDS
 * - Resolves stitched response for the original publish request
 * - Does not perform any additional side-effects
 */
export default class OnPublishActionHandler {
    public static async handleBppOnPublishRequest(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        return OnixBppController.requestWrapper(BecknAction.on_publish, req, () => {
            OnPublishActionHandler.handleOnCatalogPublishCallback(req);
        });
    }

    /**
     * Handles /on_catalog_publish callback from CDS.
     * - Immediately returns ACK to CDS (via requestWrapper)
     * - Resolves stitched response for the original publish request
     * - Does not perform any additional side-effects
     */
    private static async handleOnCatalogPublishCallback(req: Request): Promise<void> {
        const body = req.body as any;
        /**
         * Using transaction_id to match the original publish request
         */
        const transactionId = body?.context?.transaction_id;

        try {
            logger.debug(`🟡 Received on_catalog_publish callback in handleOnCatalogPublishCallback`, { 
                data: { transactionId, body } 
            });

            if (!transactionId) {
                logger.error(`🔴 Missing context.transaction_id in on_catalog_publish payload`);
                return;
            }

            // Resolve the stitched response
            const resolved = RequestsStoreService.resolveStitchedResponse(transactionId, body);
            if (!resolved) {
                logger.error(`🔴 No pending stitched request found for transaction_id - [${transactionId}] in handleOnCatalogPublishCallback`);
            }
            else {
                logger.debug(`🟢 Resolved stitched publish request for transaction_id - [${transactionId}] in handleOnCatalogPublishCallback`);
            }
        }
        catch (e: any) {
            logger.error(`🔴 Error processing on_catalog_publish in handleOnCatalogPublishCallback`, e instanceof Error ? e : undefined, {});
        }
    }
}

