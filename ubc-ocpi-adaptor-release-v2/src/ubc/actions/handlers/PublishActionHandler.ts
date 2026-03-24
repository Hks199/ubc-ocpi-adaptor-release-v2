import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { PostAppPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PostAppPublishRequestPayload';
import { AppPublishResponsePayload } from '../../schema/v2.0.0/actions/publish/types/AppPublishResponsePayload';
import PublishActionService from '../services/PublishActionService';
import RequestsStoreService from '../../../utils/RequestsStoreService';
import { UBCPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PublishPayload';
import Utils from '../../../utils/Utils';
import { databaseService } from '../../../services/database.service';

/** Batch size for processing locations */
const BATCH_SIZE = 15;
/** Sleep time between batches in milliseconds */
const BATCH_SLEEP_MS = 5000;

/**
 * Helper function to sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper function to split array into chunks
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Handler for publish action
 */
export default class PublishActionHandler {
    /**
     * Handles publish request - waits for stitched response from on_publish callback
     * Does not use requestWrapper because we need to wait for the callback before responding
     * Processes locations in batches of 20 with 1 second delay between batches
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
            // Process publish in batches
            const { responses, totalCount } = await PublishActionHandler.handleBatchedPublish(payload);

            logger.debug(`🟢 Returning batched publish response in handleBppPublishRequest`, {
                totalBatches: responses.length,
                totalCount: totalCount,
            });

            return {
                httpStatus: 200,
                payload: {
                    batchesProcessed: responses.length,
                    responses: responses,
                    totalCount: totalCount,
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
     * Handles batched publishing - processes locations in batches of 20 with 1 second delay
     * Supports partner_id (fetches all location IDs), ocpi_location_ids, evse_ids, or connector_ids
     */
    private static async handleBatchedPublish(
        payload: PostAppPublishRequestPayload
    ): Promise<{ responses: AppPublishResponsePayload[], totalCount: number }> {
        const reqId = Utils.generateUUID();
        const responses: AppPublishResponsePayload[] = [];
        let allPublishedCount = 0;

        // Determine what to batch based on payload type
        if (payload.partner_id) {
            // Fetch all location IDs for the partner first
            const locationIds = await PublishActionHandler.getLocationIdsForPartner(payload.partner_id);
            
            if (locationIds.length === 0) {
                throw new Error(`No locations found for partner_id: ${payload.partner_id}`);
            }

            logger.info(`🟡 [${reqId}] Processing ${locationIds.length} locations for partner ${payload.partner_id} in batches of ${BATCH_SIZE}`);

            // Split into batches
            const batches = chunkArray(locationIds, BATCH_SIZE);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                logger.info(`🟡 [${reqId}] Processing batch ${i + 1}/${batches.length} with ${batch.length} locations`);

                const batchPayload: PostAppPublishRequestPayload = {
                    ...payload,
                    ocpi_location_ids: batch,
                    partner_id: undefined, // Clear partner_id since we're using location_ids
                };

                try {
                    const {response, totalCount} = await PublishActionHandler.handleEVChargingUBCBppPublishAction(batchPayload);
                    responses.push(response);
                    allPublishedCount += totalCount;
                    logger.info(`🟢 [${reqId}] Batch ${i + 1}/${batches.length} completed successfully`);
                }
                catch (e: any) {
                    logger.error(`🔴 [${reqId}] Batch ${i + 1}/${batches.length} failed: ${e?.toString()}`, e);
                    // Continue with next batch even if one fails
                }

                // Sleep between batches (except after the last one)
                if (i < batches.length - 1) {
                    logger.debug(`🟡 [${reqId}] Sleeping ${BATCH_SLEEP_MS}ms before next batch`);
                    await sleep(BATCH_SLEEP_MS);
                }
            }
        }
        else if (payload.ocpi_location_ids && payload.ocpi_location_ids.length > BATCH_SIZE) {
            // Batch the location IDs
            const batches = chunkArray(payload.ocpi_location_ids, BATCH_SIZE);

            logger.info(`🟡 [${reqId}] Processing ${payload.ocpi_location_ids.length} locations in ${batches.length} batches of ${BATCH_SIZE}`);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                logger.info(`🟡 [${reqId}] Processing batch ${i + 1}/${batches.length} with ${batch.length} locations`);

                const batchPayload: PostAppPublishRequestPayload = {
                    ...payload,
                    ocpi_location_ids: batch,
                };

                try {
                    const {response, totalCount} = await PublishActionHandler.handleEVChargingUBCBppPublishAction(batchPayload);
                    allPublishedCount += totalCount;
                    responses.push(response);
                    logger.info(`🟢 [${reqId}] Batch ${i + 1}/${batches.length} completed successfully`);
                }
                catch (e: any) {
                    logger.error(`🔴 [${reqId}] Batch ${i + 1}/${batches.length} failed: ${e?.toString()}`, e);
                    // Continue with next batch even if one fails
                }

                // Sleep between batches (except after the last one)
                if (i < batches.length - 1) {
                    logger.debug(`🟡 [${reqId}] Sleeping ${BATCH_SLEEP_MS}ms before next batch`);
                    await sleep(BATCH_SLEEP_MS);
                }
            }
        }
        else {
            // Small request or evse_ids/connector_ids - process directly without batching
            logger.info(`🟡 [${reqId}] Processing single batch (small request or evse_ids/connector_ids)`);
            const {response, totalCount} = await PublishActionHandler.handleEVChargingUBCBppPublishAction(payload);
            allPublishedCount += totalCount;
            responses.push(response);
        }

        logger.info(`🟢 [${reqId}] Publish action completed. Total published count: ${allPublishedCount}`);

        return { responses, totalCount: allPublishedCount };
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
                }
            );
            throw e;
        }
    }
}

