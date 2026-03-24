import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPITariffResponse, OCPITariffsResponse } from '../../../../schema/modules/tariffs/types/responses';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { TariffDbService } from '../../../../../db-services/TariffDbService';
import { OCPITariff } from '../../../../schema/modules/tariffs/types';
import { logger } from '../../../../../services/logger.service';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { databaseService } from '../../../../../services/database.service';
import { OCPILogCommand } from '../../../../types';

/**
 * Handle all outgoing requests for the Tariffs module to the CPO
 */
export default class OCPIv221TariffsModuleOutgoingRequestService {
    public static async sendGetTariffs(
        req: Request,
        cpoAuthToken: string | undefined,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITariffsResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /tariffs (outgoing)', partnerId };
        let url = '';

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /tariffs (outgoing) in sendGetTariffs`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting OCPI endpoint URL in sendGetTariffs`, { data: logData });
            const baseUrl = await Utils.getOcpiEndpoint('tariffs', 'SENDER', partnerId);

            logger.debug(`🟡 [${reqId}] Parsing query parameters in sendGetTariffs`, { 
                data: { logData, query: req.query } 
            });
            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;
            const dateFrom = req.query.date_from as string | undefined;
            const dateTo = req.query.date_to as string | undefined;
            const countryCode = req.query.country_code as string | undefined;
            const partyId = req.query.party_id as string | undefined;

            logger.debug(`🟡 [${reqId}] Building URL with query params in sendGetTariffs`, { 
                data: { logData, params: { limit, offset, dateFrom, dateTo, countryCode, partyId } } 
            });
            url = OCPIv221TariffsModuleOutgoingRequestService.appendQueryParams(
                baseUrl,
                { limit, offset, dateFrom, dateTo, countryCode, partyId }
            );

            if (!cpoAuthToken) {
                logger.warn(`🟡 [${reqId}] CPO auth token missing in sendGetTariffs`, { data: logData });
                return OCPIResponseService.clientError<unknown>({
                    message: 'CPO auth token is required',
                }) as HttpResponse<OCPITariffsResponse>;
            }

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] Partner ID missing in sendGetTariffs`, { data: logData });
                return OCPIResponseService.clientError<unknown>({
                    message: 'Partner ID is required',
                }) as HttpResponse<OCPITariffsResponse>;
            }

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO in sendGetTariffs`, { 
                data: { logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        cpoAuthToken,
                    ),
                },
                partnerId,
                requestCommand: OCPILogCommand.SendGetTariffsReq,
                responseCommand: OCPILogCommand.SendGetTariffsRes,
            });

            // Log response for debugging
            logger.debug(`🟢 [${reqId}] Received response from CPO in sendGetTariffs`, {
                data: { logData, url, status: response?.status, hasData: !!response?.data, dataType: typeof response?.data, isArray: Array.isArray(response?.data) },
            });

            logger.debug(`🟡 [${reqId}] Processing response data in sendGetTariffs`, { data: logData });
            // Handle axios response structure - axios returns { data, status, headers, ... }
            const responseData = response?.data;
            let payload: OCPITariffsResponse;

            // Check if response is already in OCPI format
            if (responseData && typeof responseData === 'object' && 'data' in responseData) {
                logger.debug(`🟡 [${reqId}] Response is in OCPI format in sendGetTariffs`, { data: logData });
                payload = responseData as OCPITariffsResponse;
            }
            else if (Array.isArray(responseData)) {
                logger.debug(`🟡 [${reqId}] Response is array, wrapping in OCPI format in sendGetTariffs`, { 
                    data: { logData, arrayLength: responseData.length } 
                });
                // If response is directly an array, wrap it in OCPI format
                payload = {
                    data: responseData,
                    status_code: 1000,
                    timestamp: new Date().toISOString(),
                };
            }
            else if (!responseData) {
                logger.debug(`🟡 [${reqId}] Empty response, returning empty array in sendGetTariffs`, { data: logData });
                // Empty response - return empty array
                payload = {
                    data: [],
                    status_code: 1000,
                    timestamp: new Date().toISOString(),
                };
            }
            else {
                logger.error(`🔴 [${reqId}] Unexpected response format from CPO in sendGetTariffs`, new Error('Invalid response format'), {
                    data: { logData, responseData, url, responseDataType: typeof responseData },
                });
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO tariffs endpoint',
                    details: `Response is not in expected OCPI format. Received: ${typeof responseData}`,
                }, OCPIResponseStatusCode.status_2000) as HttpResponse<OCPITariffsResponse>;
            }

            // Validate payload structure
            if (!payload || !payload.data) {
                logger.debug(`🟡 [${reqId}] Payload data missing, using empty array in sendGetTariffs`, { data: logData });
                // Empty array is valid - no tariffs available
                payload = {
                    data: [],
                    status_code: 1000,
                    timestamp: new Date().toISOString(),
                };
            }

            if (!Array.isArray(payload.data)) {
                logger.error(`🔴 [${reqId}] Payload data is not an array in sendGetTariffs`, new Error('Invalid payload structure'), {
                    data: { logData, payload, url },
                });
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO tariffs endpoint',
                    details: 'Response data is not an array',
                }) as HttpResponse<OCPITariffsResponse>;
            }

            logger.debug(`🟡 [${reqId}] Persisting ${payload.data.length} tariffs to DB in sendGetTariffs`, { data: logData });
            // Persist all tariffs into DB
            let storedCount = 0;
            for (const ocpiTariff of payload.data) {
                try {
                    await TariffDbService.upsertFromOcpiTariff(ocpiTariff, partnerId);
                    storedCount++;
                }
                catch (error) {
                    logger.error(`🔴 [${reqId}] Error storing tariff from CPO in sendGetTariffs`, error as Error, {
                        data: { logData, tariffId: ocpiTariff?.id, countryCode: ocpiTariff?.country_code, partyId: ocpiTariff?.party_id },
                    });
                    // Continue processing other tariffs even if one fails
                }
            }

            logger.debug(`🟢 [${reqId}] Tariffs fetched and stored from CPO in sendGetTariffs`, {
                data: { logData, fetched: payload.data.length, stored: storedCount, url },
            });

            logger.debug(`🟡 [${reqId}] Checking for pagination link header in sendGetTariffs`, { data: logData });
            // Handle pagination - follow Link header if present
            const linkHeader = response.headers?.['link'] || response.headers?.['Link'];
            if (linkHeader && typeof linkHeader === 'string') {
                // Extract next link and continue fetching if needed
                const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                if (nextMatch && nextMatch[1]) {
                    // Could implement recursive fetching here if needed
                    logger.debug(`🟡 [${reqId}] More tariffs available via pagination in sendGetTariffs`, { 
                        data: { logData, nextLink: nextMatch[1] } 
                    });
                }
            }

            logger.debug(`🟢 [${reqId}] Returning GET /tariffs (outgoing) response in sendGetTariffs`, { 
                data: { logData, httpStatus: 200, tariffsCount: payload.data.length } 
            });

            return {
                httpStatus: 200,
                payload,
                headers: response.headers,
            };        
        }
        catch (error: unknown) {
            // Handle axios error responses (status >= 400)
            const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string; code?: string };
            
            let errorMessage = 'Unknown error';
            let httpStatus = 500;
            let errorDetails: unknown = error;

            if (axiosError?.response) {
                // Axios error with HTTP response (4xx, 5xx)
                httpStatus = axiosError.response.status || 500;
                errorDetails = axiosError.response.data;
                errorMessage = `HTTP ${httpStatus} from CPO endpoint`;

                logger.error(`🔴 [${reqId}] CPO returned error response in sendGetTariffs`, new Error(errorMessage), {
                    data: { logData, url, httpStatus, responseData: axiosError.response.data },
                });

                // If CPO returned an OCPI error response, pass it through
                if (axiosError.response.data && typeof axiosError.response.data === 'object' && 'status_code' in axiosError.response.data) {
                    return {
                        httpStatus,
                        payload: axiosError.response.data as OCPITariffsResponse,
                    };
                }

                // Handle specific HTTP status codes
                if (httpStatus === 401 || httpStatus === 403) {
                    return OCPIResponseService.clientError<unknown>({
                        message: 'Authentication failed',
                        details: 'Invalid or missing OCPI authentication token. Please check OCPI_CPO_AUTH_TOKEN environment variable.',
                        error: errorMessage,
                    }) as HttpResponse<OCPITariffsResponse>;
                }

                if (httpStatus === 404) {
                    return OCPIResponseService.clientError<unknown>({
                        message: 'Tariffs endpoint not found',
                        details: 'CPO tariffs endpoint returned 404. Please check the endpoint URL configuration.',
                        error: errorMessage,
                    }) as HttpResponse<OCPITariffsResponse>;
                }
            }
            else {
                // Network or other error
                errorMessage = axiosError?.message || String(error);
                const errorCode = axiosError?.code || '';

                logger.error('Failed to fetch tariffs from CPO', error as Error, {
                    url: req.url,
                    query: req.query,
                    errorCode,
                });

                // Check if it's a network/connection error
                if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
                    return OCPIResponseService.serverError<unknown>({
                        message: 'Failed to connect to CPO tariffs endpoint',
                        details: 'CPO endpoint is not reachable. Please check the endpoint URL and network connectivity.',
                        error: errorMessage,
                    }) as HttpResponse<OCPITariffsResponse>;
                }

                // Check if it's an authentication error
                if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('OCPI_CPO_AUTH_TOKEN')) {
                    return OCPIResponseService.clientError<unknown>({
                        message: 'Authentication failed',
                        details: 'Invalid or missing OCPI authentication token. Please check OCPI_CPO_AUTH_TOKEN environment variable.',
                        error: errorMessage,
                    }) as HttpResponse<OCPITariffsResponse>;
                }
            }

            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch tariffs from CPO',
                details: errorMessage,
                error: errorDetails,
            }) as HttpResponse<OCPITariffsResponse>;
        }
    }

    public static async sendGetTariff(
        req: Request,
        cpoAuthToken: string | undefined,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITariffResponse>> {
        const tariffId = req.params.tariff_id;
        const countryCode = (req.params.country_code as string) || (req.query.country_code as string);
        const partyId = (req.params.party_id as string) || (req.query.party_id as string);

        if (!tariffId || !cpoAuthToken || !partnerId) {
            return OCPIResponseService.clientError<unknown>({
                message: 'tariff_id path parameter is required',
            }, OCPIResponseStatusCode.status_2000) as HttpResponse<OCPITariffResponse>;
        }

        // OCPI 2.2.1 requires country_code and party_id for tariff identification
        // However, we'll try to fetch from CPO even without them, and use values from response if available
        if (!countryCode || !partyId) {
            logger.warn('Fetching tariff without country_code and party_id - may fail if CPO requires them', {
                tariffId,
                countryCode,
                partyId,
            });
        }

        try {
            // First, try to fetch from DB cache

            if (countryCode && partyId) {
                const cachedTariff = await TariffDbService.findByOcpiTariffId(
                    countryCode,
                    partyId,
                    tariffId,
                    partnerId,
                );

                if (cachedTariff) {
                    const ocpiTariff: OCPITariff = TariffDbService.mapPrismaTariffToOcpi(
                        cachedTariff
                    );
                    return OCPIResponseService.success(ocpiTariff) as HttpResponse<OCPITariffResponse>;
                }
            }

            // Not in DB, fetch from CPO
            // OCPI 2.2.1 requires country_code and party_id in URL path
            const baseUrl = await Utils.getOcpiEndpoint('tariffs', 'SENDER', partnerId);
            let url: string;
            if (countryCode && partyId) {
                // Use OCPI 2.2.1 compliant URL format
                url = `${baseUrl}/${encodeURIComponent(countryCode)}/${encodeURIComponent(partyId)}/${encodeURIComponent(tariffId)}`;
            }
            else {
                // Fallback to tariff_id only (less ideal)
                url = `${baseUrl}/${encodeURIComponent(tariffId)}`;
            }

            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        cpoAuthToken,
                    ),
                },
                partnerId: partnerId,
                requestCommand: OCPILogCommand.SendGetTariffReq,
                responseCommand: OCPILogCommand.SendGetTariffRes,
            });

            // Handle axios response structure
            const responseData = response?.data || response;
            let payload: OCPITariffResponse;

            // Check if response is already in OCPI format
            if (responseData && typeof responseData === 'object' && 'data' in responseData) {
                payload = responseData as OCPITariffResponse;
            }
            else if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
                // If response is directly a tariff object, wrap it in OCPI format
                payload = {
                    data: responseData as OCPITariff,
                    status_code: 1000,
                    timestamp: new Date().toISOString(),
                };
            }
            else {
                logger.error('Unexpected response format from CPO', new Error('Invalid response format'), {
                    responseData,
                    url,
                });
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO tariff endpoint',
                    details: 'Response is not in expected OCPI format',
                }, OCPIResponseStatusCode.status_2000) as HttpResponse<OCPITariffResponse>;
            }

            if (!payload || !payload.data) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff not found in CPO response',
                    details: 'CPO endpoint returned empty or invalid tariff data',
                }, OCPIResponseStatusCode.status_2003) as HttpResponse<OCPITariffResponse>;
            }

            // Ensure country_code and party_id are present in the tariff data
            // Use values from URL if not in response
            if (!payload.data.country_code && countryCode) {
                payload.data.country_code = countryCode;
            }
            if (!payload.data.party_id && partyId) {
                payload.data.party_id = partyId;
            }

            // Validate that we have all required fields before storing
            if (!payload.data.country_code || !payload.data.party_id) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff missing required fields',
                    details: 'CPO response is missing country_code or party_id. Please provide them in the request URL or query parameters.',
                    tariffId: payload.data.id,
                    hasCountryCode: !!payload.data.country_code,
                    hasPartyId: !!payload.data.party_id,
                }, OCPIResponseStatusCode.status_2000) as HttpResponse<OCPITariffResponse>;
            }

            const stored = await TariffDbService.upsertFromOcpiTariff(payload.data, partnerId!);
            const ocpiTariff = TariffDbService.mapPrismaTariffToOcpi(stored);

            logger.info('Tariff fetched and stored from CPO', {
                tariffId: ocpiTariff.id,
                countryCode: ocpiTariff.country_code,
                partyId: ocpiTariff.party_id,
                url,
            });

            return OCPIResponseService.success(ocpiTariff) as HttpResponse<OCPITariffResponse>;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to fetch tariff from CPO', error as Error, {
                tariffId,
                countryCode,
                partyId,
                url: req.url,
            });

            // Check if it's a network/connection error
            if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('timeout')) {
                return OCPIResponseService.serverError<unknown>({
                    message: 'Failed to connect to CPO tariff endpoint',
                    details: 'CPO endpoint is not reachable. Please check the endpoint URL and network connectivity.',
                    error: errorMessage,
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Check if it's an authentication error
            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('OCPI_CPO_AUTH_TOKEN')) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Authentication failed',
                    details: 'Invalid or missing OCPI authentication token. Please check OCPI_CPO_AUTH_TOKEN environment variable.',
                    error: errorMessage,
                }) as HttpResponse<OCPITariffResponse>;
            }

            // Check if it's a 404 (tariff not found)
            if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Tariff not found',
                    details: `Tariff ${tariffId} was not found at the CPO endpoint`,
                    error: errorMessage,
                }) as HttpResponse<OCPITariffResponse>;
            }

            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch tariff from CPO',
                details: errorMessage,
                error: errorMessage,
            }) as HttpResponse<OCPITariffResponse>;
        }
    }

    private static async getTariffsEndpointUrl(role: 'SENDER' | 'RECEIVER'): Promise<string> {
        return Utils.getOcpiEndpoint('tariffs', role);
    }

    /**
     * Helper to resolve which OCPI partner a tariffs call is associated with,
     * based on the configured tariffs endpoint.
     */
    private static async getTariffsPartnerId(): Promise<string> {
        const prisma = databaseService.prisma;
        const endpoint = await prisma.oCPIPartnerEndpoint.findFirst({
            where: {
                module: 'tariffs',
                role: 'SENDER',
                deleted: false,
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        if (!endpoint) {
            throw new Error('OCPI tariffs endpoint (module=tariffs, role=SENDER) not configured in oCPIPartnerEndpoint');
        }

        return endpoint.partner_id;
    }

    private static appendQueryParams(
        baseUrl: string,
        params: {
            limit?: number;
            offset?: number;
            dateFrom?: string;
            dateTo?: string;
            countryCode?: string;
            partyId?: string;
        }
    ): string {
        const searchParams = new globalThis.URLSearchParams();

        if (typeof params.limit === 'number' && !Number.isNaN(params.limit)) {
            searchParams.append('limit', params.limit.toString());
        }

        if (typeof params.offset === 'number' && !Number.isNaN(params.offset)) {
            searchParams.append('offset', params.offset.toString());
        }

        if (params.dateFrom) {
            searchParams.append('date_from', params.dateFrom);
        }

        if (params.dateTo) {
            searchParams.append('date_to', params.dateTo);
        }

        if (params.countryCode) {
            searchParams.append('country_code', params.countryCode);
        }

        if (params.partyId) {
            searchParams.append('party_id', params.partyId);
        }

        const queryString = searchParams.toString();
        if (!queryString) {
            return baseUrl;
        }

        return `${baseUrl}?${queryString}`;
    }

}

