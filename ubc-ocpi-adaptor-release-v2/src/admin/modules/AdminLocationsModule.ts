import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import {
    OCPILocationResponse,
    OCPILocationsResponse,
} from '../../ocpi/schema/modules/locations/types/responses';
import OCPIv221LocationsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleOutgoingRequestService';
import { ValidationError } from '../../utils/errors';
import { databaseService } from '../../services/database.service';
import { LocationDbService } from '../../db-services/LocationDbService';
import OCPIResponseService from '../../ocpi/services/OCPIResponseService';
import { logger } from '../../services/logger.service';
import { OCPIPartnerAdditionalProps } from '../../types/OCPIPartner';

export default class AdminLocationsModule {
    public static async sendGetLocations(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationsResponse>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'sendGetLocations' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetLocations in AdminLocationsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing query parameters in sendGetLocations`, { 
                data: { ...logData, query: req.query } 
            });
            const { partner_id: partnerId, page: pageParam } = req.query as { partner_id?: string; page?: string };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in sendGetLocations`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in sendGetLocations`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in sendGetLocations`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in sendGetLocations`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in sendGetLocations`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            // Parse page parameter (default to 0 if not provided)
            let page = pageParam ? Number(pageParam) : 0;
            if (isNaN(page) || page < 0) {
                logger.warn(`🟡 [${reqId}] Invalid page parameter: ${pageParam}, defaulting to 0`, { 
                    data: { ...logData, page_param: pageParam } 
                });
                page = 0;
            }

            // Paginate through all locations with limit=100
            const PAGE_SIZE = 100;
            const DELAY_BETWEEN_PAGES_MS = 10000; // 10 seconds delay between pages to avoid rate limiting
            const MAX_RETRIES = 3;
            const INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds initial retry delay
            const initialOffset = Math.max(0, page) * PAGE_SIZE; // Calculate offset from page number
            let offset = initialOffset;
            let allLocations: any[] = [];
            let hasMorePages = true;
            let firstResponse: HttpResponse<OCPILocationsResponse> | null = null;

            logger.debug(`🟡 [${reqId}] Starting paginated fetch of locations from CPO`, { 
                data: { ...logData, partner_id: partnerId, page: Math.max(0, page), page_size: PAGE_SIZE, starting_offset: initialOffset, delay_ms: DELAY_BETWEEN_PAGES_MS } 
            });

            // Helper function to sleep/delay
            const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            // Helper function to retry with exponential backoff for 429 errors
            const fetchPageWithRetry = async (pageOffset: number, retryCount: number = 0): Promise<HttpResponse<OCPILocationsResponse>> => {
                // Modify request query with pagination parameters
                const originalLimit = req.query.limit;
                const originalOffset = req.query.offset;
                req.query.limit = PAGE_SIZE.toString();
                req.query.offset = pageOffset.toString();

                try {
                    logger.debug(`🟡 [${reqId}] Fetching page ${Math.floor(pageOffset / PAGE_SIZE) + 1} (offset: ${pageOffset}, limit: ${PAGE_SIZE}, retry: ${retryCount})`, { 
                        data: { ...logData, partner_id: partnerId, offset: pageOffset, limit: PAGE_SIZE, retry: retryCount } 
                    });

                    const ocpiResponse =
                        await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocations(
                            req,
                            creds.cpo_auth_token || undefined,
                            partnerId,
                        );

                    // Restore original query parameters
                    if (originalLimit !== undefined) {
                        req.query.limit = originalLimit;
                    }
                    else {
                        delete req.query.limit;
                    }
                    if (originalOffset !== undefined) {
                        req.query.offset = originalOffset;
                    }
                    else {
                        delete req.query.offset;
                    }

                    // Check for 429 rate limit error
                    if (ocpiResponse.httpStatus === 429) {
                        if (retryCount < MAX_RETRIES) {
                            const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount); // Exponential backoff
                            logger.warn(`🟡 [${reqId}] Rate limited (429), retrying after ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`, { 
                                data: { ...logData, httpStatus: 429, retry: retryCount + 1, retryDelay } 
                            });
                            await sleep(retryDelay);
                            return fetchPageWithRetry(pageOffset, retryCount + 1);
                        }
                        else {
                            logger.error(`🔴 [${reqId}] Rate limited (429) after ${MAX_RETRIES} retries, giving up`, undefined, { 
                                data: { ...logData, httpStatus: 429, maxRetries: MAX_RETRIES } 
                            });
                        }
                    }

                    return ocpiResponse;
                }
                catch (error: any) {
                    // Restore original query parameters on error
                    if (originalLimit !== undefined) {
                        req.query.limit = originalLimit;
                    }
                    else {
                        delete req.query.limit;
                    }
                    if (originalOffset !== undefined) {
                        req.query.offset = originalOffset;
                    }
                    else {
                        delete req.query.offset;
                    }

                    // Check if it's a 429 error in the exception
                    if (error?.response?.status === 429 || error?.status === 429) {
                        if (retryCount < MAX_RETRIES) {
                            const retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
                            logger.warn(`🟡 [${reqId}] Rate limited (429) in exception, retrying after ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`, { 
                                data: { ...logData, httpStatus: 429, retry: retryCount + 1, retryDelay } 
                            });
                            await sleep(retryDelay);
                            return fetchPageWithRetry(pageOffset, retryCount + 1);
                        }
                        else {
                            logger.error(`🔴 [${reqId}] Rate limited (429) after ${MAX_RETRIES} retries, giving up`, undefined, { 
                                data: { ...logData, httpStatus: 429, maxRetries: MAX_RETRIES } 
                            });
                        }
                    }
                    throw error;
                }
            };

            while (hasMorePages) {
                const ocpiResponse = await fetchPageWithRetry(offset);

                // Store first response for headers and status code
                if (!firstResponse) {
                    firstResponse = ocpiResponse;
                }

                logger.debug(`🟢 [${reqId}] Received page response from CPO`, { 
                    data: { ...logData, httpStatus: ocpiResponse.httpStatus, hasData: !!ocpiResponse.payload, page: Math.floor(offset / PAGE_SIZE) + 1 } 
                });

                // Check if request was successful
                if (ocpiResponse.httpStatus !== 200 || !ocpiResponse.payload || !Array.isArray(ocpiResponse.payload.data)) {
                    // For 429 errors, we've already retried, so stop pagination
                    if (ocpiResponse.httpStatus === 429) {
                        logger.error(`🔴 [${reqId}] Rate limited (429) - stopping pagination. Fetched ${allLocations.length} locations so far.`, undefined, { 
                            data: { ...logData, httpStatus: ocpiResponse.httpStatus, locations_fetched: allLocations.length } 
                        });
                    }
                    else {
                        logger.warn(`🟡 [${reqId}] Invalid response or error from CPO, stopping pagination`, { 
                            data: { ...logData, httpStatus: ocpiResponse.httpStatus, hasData: !!ocpiResponse.payload } 
                        });
                    }
                    hasMorePages = false;
                    break;
                }

                const pageLocations = ocpiResponse.payload.data;
                
                logger.debug(`🟢 [${reqId}] Fetched ${pageLocations.length} locations in this page`, { 
                    data: { ...logData, page: Math.floor(offset / PAGE_SIZE) + 1, page_count: pageLocations.length, offset } 
                });

                // Store locations immediately (process in batches)
                if (pageLocations.length > 0) {
                    logger.debug(`🟡 [${reqId}] Persisting ${pageLocations.length} locations from this page to database`, { 
                        data: { ...logData, page: Math.floor(offset / PAGE_SIZE) + 1, locations_count: pageLocations.length } 
                    });
                    for (const ocpiLocation of pageLocations) {
                        await LocationDbService.upsertFromOcpiLocation(ocpiLocation, partnerId);
                    }
                    logger.debug(`🟢 [${reqId}] Persisted ${pageLocations.length} locations from this page to database`, { 
                        data: { ...logData, page: Math.floor(offset / PAGE_SIZE) + 1, locations_count: pageLocations.length } 
                    });
                }

                // Add to allLocations for response
                allLocations = allLocations.concat(pageLocations);

                // If we got fewer locations than the page size, we've reached the end
                if (pageLocations.length < PAGE_SIZE) {
                    hasMorePages = false;
                }
                else {
                    offset += PAGE_SIZE;
                    // Add delay between pages to avoid rate limiting
                    if (hasMorePages) {
                        logger.debug(`🟡 [${reqId}] Waiting ${DELAY_BETWEEN_PAGES_MS}ms before fetching next page`, { 
                            data: { ...logData, delay_ms: DELAY_BETWEEN_PAGES_MS } 
                        });
                        await sleep(DELAY_BETWEEN_PAGES_MS);
                    }
                }
            }

            logger.debug(`🟢 [${reqId}] Completed paginated fetch, total locations: ${allLocations.length}`, { 
                data: { ...logData, total_locations: allLocations.length, pages_fetched: Math.floor(offset / PAGE_SIZE) + (allLocations.length > 0 ? 1 : 0), starting_page: Math.max(0, page), starting_offset: initialOffset } 
            });

            // Build combined response
            const combinedPayload: OCPILocationsResponse = {
                status_code: firstResponse?.payload?.status_code ?? 1000,
                status_message: firstResponse?.payload?.status_message ?? 'Success',
                timestamp: firstResponse?.payload?.timestamp ?? new Date().toISOString(),
                data: allLocations,
            };

            logger.debug(`🟢 [${reqId}] Returning sendGetLocations response`, { 
                data: { ...logData, httpStatus: firstResponse?.httpStatus ?? 200, total_locations: allLocations.length } 
            });

            return {
                httpStatus: firstResponse?.httpStatus ?? 200,
                headers: firstResponse?.headers,
                payload: {
                    data: combinedPayload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetLocations: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    public static async sendGetLocation(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationResponse>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'sendGetLocation' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetLocation in AdminLocationsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing query and path parameters in sendGetLocation`, { 
                data: { ...logData, query: req.query, params: req.params } 
            });
            const { partner_id: partnerId } = req.query as { partner_id?: string };
            const locationId = req.params.location_id;

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in sendGetLocation`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            if (!locationId) {
                logger.warn(`🟡 [${reqId}] location_id missing in sendGetLocation`, { data: logData });
                throw new ValidationError('location_id path parameter is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in sendGetLocation`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in sendGetLocation`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in sendGetLocation`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in sendGetLocation`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            logger.debug(`🟡 [${reqId}] Sending GET location to CPO in sendGetLocation`, { 
                data: { ...logData, location_id: locationId, partner_id: partnerId } 
            });
            const ocpiResponse =
                await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocation(
                    req,
                    creds.cpo_auth_token,
                    partnerId,
                );

            logger.debug(`🟢 [${reqId}] Received response from CPO in sendGetLocation`, { 
                data: { ...logData, httpStatus: ocpiResponse.httpStatus, hasData: !!ocpiResponse.payload } 
            });

            // On success, persist location tree into DB
            if (
                ocpiResponse.httpStatus === 200 &&
                ocpiResponse.payload &&
                ocpiResponse.payload.data
            ) {
                logger.debug(`🟡 [${reqId}] Persisting location to database in sendGetLocation`, { 
                    data: { ...logData, location_id: locationId } 
                });
                await LocationDbService.upsertFromOcpiLocation(ocpiResponse.payload.data, partnerId);
                logger.debug(`🟢 [${reqId}] Persisted location to database in sendGetLocation`, { 
                    data: { ...logData, location_id: locationId } 
                });
            }

            logger.debug(`🟢 [${reqId}] Returning sendGetLocation response`, { 
                data: { ...logData, httpStatus: ocpiResponse.httpStatus } 
            });

            return {
                httpStatus: ocpiResponse.httpStatus,
                headers: ocpiResponse.headers,
                payload: {
                    data: ocpiResponse.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetLocation: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Bulk generate beckn_connector_id for all connectors of a partner
     * Format: IND*{ubc_party_id}*{ocpi_location_id}*{evse_uid}*{connector_id}
     */
    public static async generateBecknConnectorIds(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<{ updated: number; connectors: Array<{ id: string; beckn_connector_id: string }> }>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'generateBecknConnectorIds' };

        try {
            logger.debug(`🟡 [${reqId}] Starting generateBecknConnectorIds in AdminLocationsModule`, { data: logData });

            const { partner_id: partnerId } = req.query as { partner_id?: string };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in generateBecknConnectorIds`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in generateBecknConnectorIds`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in generateBecknConnectorIds`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            // Get ubc_party_id from partner's additional_props, default to 'TPC'
            const additionalProps = partner.additional_props as OCPIPartnerAdditionalProps | null;
            const ubcPartyId = additionalProps?.ubc_party_id ?? 'TPC';

            logger.debug(`🟡 [${reqId}] Generating beckn_connector_ids with ubcPartyId: ${ubcPartyId}`, { 
                data: { ...logData, partner_id: partnerId, ubcPartyId } 
            });

            const result = await LocationDbService.generateBecknConnectorIdsForPartner(partnerId, ubcPartyId);

            logger.debug(`🟢 [${reqId}] Generated beckn_connector_ids for ${result.updated} connectors`, { 
                data: { ...logData, updated: result.updated } 
            });

            return {
                httpStatus: 200,
                payload: {
                    data: result,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in generateBecknConnectorIds: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    public static async generateBecknIds(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<{ updated: number; connectors: Array<{ id: string; beckn_connector_id: string }> }>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'generateBecknConnectorIds' };

        try {
            logger.debug(`🟡 [${reqId}] Starting generateBecknConnectorIds in AdminLocationsModule`, { data: logData });

            const { partner_id: partnerId } = req.query as { partner_id?: string };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in generateBecknConnectorIds`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in generateBecknConnectorIds`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in generateBecknConnectorIds`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            // Get ubc_party_id from partner's additional_props, default to 'TPC'
            const additionalProps = partner.additional_props as OCPIPartnerAdditionalProps | null;
            const ubcPartyId = additionalProps?.ubc_party_id ?? 'TPC';

            logger.debug(`🟡 [${reqId}] Generating beckn_connector_ids with ubcPartyId: ${ubcPartyId}`, { 
                data: { ...logData, partner_id: partnerId, ubcPartyId } 
            });

            const result = await LocationDbService.generateBecknIdsForPartner(partnerId, ubcPartyId);

            logger.debug(`🟢 [${reqId}] Generated beckn_connector_ids for ${result.updated} connectors`, { 
                data: { ...logData, updated: result.updated } 
            });

            return {
                httpStatus: 200,
                payload: {
                    data: result,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in generateBecknConnectorIds: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}