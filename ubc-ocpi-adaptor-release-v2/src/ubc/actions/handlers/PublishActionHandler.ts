import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { PostAppPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PostAppPublishRequestPayload';
import { AppPublishResponsePayload } from '../../schema/v2.0.0/actions/publish/types/AppPublishResponsePayload';
import PublishActionService from '../services/PublishActionService';
import RequestsStoreService from '../../../utils/RequestsStoreService';
import { UBCPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PublishPayload';
import Utils from '../../../utils/Utils';
import { axiosUpstreamErrorMeta } from '../../../utils/axiosUpstreamErrorMeta';
import { databaseService } from '../../../services/database.service';

/**
 * Handler for publish action
 */
export default class PublishActionHandler {
    /**
     * Handles publish request - waits for stitched response from on_publish callback
     * Does not use requestWrapper because we need to wait for the callback before responding
     * Publishes in a single CDS call (location batching disabled so the catalog is not overwritten per batch).
     */
    public static async handleBppPublishRequest(
        req: Request
    ): Promise<HttpResponse<AppPublishResponsePayload>> {
        const payload = req.body as PostAppPublishRequestPayload;

        // Debug: Log the incoming request body structure
        logger.debug(`🟡 Received publish request body`, { 
            body: req.body,
            hasOcpiLocationIds: !!payload?.ocpi_location_ids 
        });

        try {
            const { responses, totalCount } = await PublishActionHandler.handlePublishSingleShot(payload);

            logger.debug(`🟢 Returning publish response in handleBppPublishRequest`, {
                totalBatches: responses.length,
                totalCount,
            });

            return {
                httpStatus: 200,
                payload: {
                    batchesProcessed: responses.length,
                    responses,
                    totalCount,
                } as any,
            };
        }
        catch (e: any) {
            logger.error(`🔴 Error in handleBppPublishRequest: ${e?.toString()}`, e, {
                payload,
            });
            throw e;
        }
    }

    /**
     * One CDS publish per request: full partner / full location list in a single merged catalog.
     * (Previous location batching caused CDS replace semantics to leave only the last batch visible in the UI.)
     */
    private static async handlePublishSingleShot(
        payload: PostAppPublishRequestPayload
    ): Promise<{ responses: AppPublishResponsePayload[], totalCount: number }> {
        const reqId = Utils.generateUUID();

        if (payload.partner_id) {
            const locationIds = await PublishActionHandler.getLocationIdsForPartner(payload.partner_id);
            if (locationIds.length === 0) {
                throw new Error(`No locations found for partner_id: ${payload.partner_id}`);
            }
            logger.info(
                `🟡 [${reqId}] Single catalog publish: ${locationIds.length} location(s) for partner ${payload.partner_id} (batching disabled)`,
            );
        }
        else {
            logger.info(`🟡 [${reqId}] Single catalog publish (batching disabled)`);
        }

        const { response, totalCount } = await PublishActionHandler.handleEVChargingUBCBppPublishAction(payload);

        logger.info(`🟢 [${reqId}] Publish completed. Total published count: ${totalCount}`);

        return { responses: [response], totalCount };
    }

    /**
     * Fetches all location IDs for a given partner
     */
    private static async getLocationIdsForPartner(partnerId: string): Promise<string[]> {
        const locations = await databaseService.prisma.location.findMany({
            where: {
                partner_id: partnerId,
                deleted: false,
            },
            select: {
                ocpi_location_id: true,
            },
        });

        return locations.map(l => l.ocpi_location_id);
    }

    public static async handleEVChargingUBCBppPublishAction(
        reqPayload: PostAppPublishRequestPayload
    ): Promise<{ response: AppPublishResponsePayload, totalCount: number }> {
        const reqId = Utils.generateUUID();
        const logData = { action: 'publish', locationIds: reqPayload.ocpi_location_ids };

        try {
            // Translate app payload to UBC format
            logger.debug(
                `🟡 [${reqId}] Translating app payload to UBC format in handleEVChargingUBCBppPublishAction`,
                { data: { logData, reqPayload } }
            );
            const { payload: ubcPublishPayload, locations } = await PublishActionService.translateAppPayloadToUBC(reqPayload);

            // Send publish request to CDS/ONIX and wait for stitched on_catalog_publish callback
            logger.debug(
                `🟡 [${reqId}] Sending publish call to CDS in handleEVChargingUBCBppPublishAction`,
                { data: { ubcPublishPayload } }
            );

            const stitchedResponse: AppPublishResponsePayload = await RequestsStoreService.getStitchedResponse({
                /**
                 * Using transaction_id to match the on_publish callback
                 */
                reqId: ubcPublishPayload.context.transaction_id,
                data: ubcPublishPayload,
                asyncFn: () => PublishActionService.sendPublishCallToBecknONIX(ubcPublishPayload),
            });

            // Update the ubc information in the connectors
            let isActive = true;
            if ('isActive' in reqPayload && reqPayload.isActive !== undefined) {
                isActive = reqPayload.isActive;
            }

            const { totalCount } = await PublishActionService.updateConnectorsAfterPublish(locations, stitchedResponse, isActive);

            logger.info(`🟢 [${reqId}] Updated ${totalCount} connectors after publish`);

            logger.debug(
                `🟢 [${reqId}] Received stitched on_catalog_publish response in handleEVChargingUBCBppPublishAction`,
                { data: { stitchedResponse } }
            );

            return { response: stitchedResponse, totalCount: totalCount };
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in PublishActionHandler.handleEVChargingUBCBppPublishAction: ${e?.toString()}`,
                e,
                {
                    data: logData,
                    ...axiosUpstreamErrorMeta(e),
                }
            );
            throw e;
        }
    }

    public static async handleEVChargingUBCBppPublishActionForBecknPayload(
        req: Request
    ): Promise<HttpResponse<AppPublishResponsePayload>> {
        const reqPayload = req.body as UBCPublishRequestPayload;
        const reqId = Utils.generateUUID();
        const logData = { action: 'publish', transactionId: reqPayload.context?.transaction_id };

        try {
            // Send publish request to CDS/ONIX and wait for stitched on_catalog_publish callback
            logger.debug(
                `🟡 [${reqId}] Sending publish call to CDS in handleEVChargingUBCBppPublishActionForBecknPayload`,
                { data: { reqPayload } }
            );

            const stitchedResponse: AppPublishResponsePayload = await RequestsStoreService.getStitchedResponse({
                /**
                 * Using transaction_id to match the on_publish callback
                 */
                reqId: reqPayload.context.transaction_id,
                data: reqPayload,
                asyncFn: () => PublishActionService.sendPublishCallToBecknONIX(reqPayload),
            });

            logger.debug(
                `🟢 [${reqId}] Received stitched on_catalog_publish response in handleEVChargingUBCBppPublishActionForBecknPayload`,
                { data: { stitchedResponse } }
            );

            return {
                httpStatus: 200,
                payload: stitchedResponse,
            };
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in PublishActionHandler.handleEVChargingUBCBppPublishActionForBecknPayload: ${e?.toString()}`,
                e,
                {
                    data: logData,
                    ...axiosUpstreamErrorMeta(e),
                }
            );
            throw e;
        }
    }
}

