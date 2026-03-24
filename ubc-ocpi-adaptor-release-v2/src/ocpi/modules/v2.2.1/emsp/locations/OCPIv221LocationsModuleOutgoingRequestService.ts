import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPILocationResponse,
    OCPILocationsResponse,
} from '../../../../schema/modules/locations/types/responses';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPILogCommand } from '../../../../types';
import { logger } from '../../../../../services/logger.service';

/**
 * Handle all outgoing requests for the Locations module to the CPO.
 *
 * This service is OCPI/EMSP–centric and is reused by the admin layer,
 * so that all OCPI-specific logic lives in one place.
 */
export default class OCPIv221LocationsModuleOutgoingRequestService {
    public static async sendGetLocations(
        req: Request,
        cpoAuthToken: string | undefined,
        partnerId?: string,
    ): Promise<HttpResponse<OCPILocationsResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /locations (outgoing)', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /locations (outgoing) in sendGetLocations`, { data: logData });

            if (!cpoAuthToken) {
                logger.warn(`🟡 [${reqId}] CPO auth token missing in sendGetLocations`, { data: logData });
                return OCPIResponseService.clientError<unknown>({
                    message: 'CPO auth token is required',
                }) as HttpResponse<OCPILocationsResponse>;
            }

            logger.debug(`🟡 [${reqId}] Getting OCPI endpoint URL in sendGetLocations`, { data: logData });
            const baseUrl = await Utils.getOcpiEndpoint('locations', 'SENDER', partnerId);

            logger.debug(`🟡 [${reqId}] Parsing query parameters in sendGetLocations`, { 
                data: { logData, query: req.query } 
            });
            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;

            const params = new globalThis.URLSearchParams();
            if (typeof limit === 'number' && !Number.isNaN(limit)) {
                params.append('limit', limit.toString());
            }
            if (typeof offset === 'number' && !Number.isNaN(offset)) {
                params.append('offset', offset.toString());
            }

            const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
            logger.debug(`🟡 [${reqId}] Sending GET request to CPO in sendGetLocations`, { 
                data: { logData, url, limit, offset } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        cpoAuthToken,
                    ),
                    ...(req.headers['X-Correlation-Id'] && { 'X-Correlation-Id': req.headers['X-Correlation-Id'] as string }),
                    ...(req.headers['x-correlation-id'] && { 'X-Correlation-Id': req.headers['x-correlation-id'] as string }),
                    ...(req.headers['X-Request-Id'] && { 'X-Request-Id': req.headers['X-Request-Id'] as string }),
                    ...(req.headers['x-request-id'] && { 'X-Request-Id': req.headers['x-request-id'] as string }),
                },
                partnerId,
                requestCommand: OCPILogCommand.SendGetLocationReq,
                responseCommand: OCPILogCommand.SendGetLocationRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO in sendGetLocations`, { 
                data: { logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPILocationsResponse;

            if (!payload || !payload.data || !Array.isArray(payload.data)) {
                logger.warn(`🟡 [${reqId}] Invalid response format from CPO in sendGetLocations`, { 
                    data: { logData, payload: !!payload, hasData: !!payload?.data, isArray: Array.isArray(payload?.data) } 
                });
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO locations endpoint',
                }) as HttpResponse<OCPILocationsResponse>;
            }

            logger.debug(`🟢 [${reqId}] Returning GET /locations (outgoing) response in sendGetLocations`, { 
                data: { logData, locationsCount: payload.data.length } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (error) {
            logger.error(`🔴 [${reqId}] Error in sendGetLocations: ${(error as Error)?.toString()}`, error as Error, { data: logData });
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch locations from CPO',
                error,
            }) as HttpResponse<OCPILocationsResponse>;
        }
    }

    public static async sendGetLocation(
        req: Request,
        cpoAuthToken: string | undefined,
        partnerId?: string,
    ): Promise<HttpResponse<OCPILocationResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const locationId = req.params.location_id;
        const logData = { action: 'GET /locations/:location_id (outgoing)', partnerId, location_id: locationId };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /locations/:location_id (outgoing) in sendGetLocation`, { data: logData });

            if (!locationId) {
                logger.warn(`🟡 [${reqId}] location_id missing in sendGetLocation`, { data: logData });
                return OCPIResponseService.clientError<unknown>({
                    message: 'location_id path parameter is required',
                }) as HttpResponse<OCPILocationResponse>;
            }
            if (!cpoAuthToken) {
                logger.warn(`🟡 [${reqId}] CPO auth token missing in sendGetLocation`, { data: logData });
                return OCPIResponseService.clientError<unknown>({
                    message: 'CPO auth token is required',
                }) as HttpResponse<OCPILocationResponse>;
            }

            logger.debug(`🟡 [${reqId}] Getting OCPI endpoint URL in sendGetLocation`, { data: logData });
            const baseUrl = await Utils.getOcpiEndpoint('locations', 'SENDER', partnerId);
            const url = `${baseUrl}/${encodeURIComponent(locationId)}`;

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO in sendGetLocation`, { 
                data: { logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        cpoAuthToken,
                    ),
                    ...(req.headers['X-Correlation-Id'] && { 'X-Correlation-Id': req.headers['X-Correlation-Id'] as string }),
                    ...(req.headers['x-correlation-id'] && { 'X-Correlation-Id': req.headers['x-correlation-id'] as string }),
                    ...(req.headers['X-Request-Id'] && { 'X-Request-Id': req.headers['X-Request-Id'] as string }),
                    ...(req.headers['x-request-id'] && { 'X-Request-Id': req.headers['x-request-id'] as string }),
                },
                partnerId,
                requestCommand: OCPILogCommand.SendGetLocationOneReq,
                responseCommand: OCPILogCommand.SendGetLocationOneRes,
                logParams: {
                    ocpi_location_id: locationId,
                },
            });

            const payload = response.data as OCPILocationResponse;

            if (!payload || !payload.data) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO location endpoint',
                }) as HttpResponse<OCPILocationResponse>;
            }

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (error) {
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch location from CPO',
                error,
            }) as HttpResponse<OCPILocationResponse>;
        }
    }

    // Endpoint URL is now resolved via Utils.getOcpiEndpoint('locations', role)
}
