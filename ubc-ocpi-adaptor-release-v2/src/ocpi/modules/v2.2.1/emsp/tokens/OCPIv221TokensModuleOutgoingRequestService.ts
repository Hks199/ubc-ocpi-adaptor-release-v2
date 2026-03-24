import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPITokenResponse,
    OCPITokensResponse,
    OCPIAuthorizationInfoResponse,
} from '../../../../schema/modules/tokens/types/responses';
import { OCPIToken, OCPILocationReferences } from '../../../../schema/modules/tokens/types';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPILogCommand } from '../../../../types';
import { logger } from '../../../../../services/logger.service';

/**
 * OCPI 2.2.1 – Tokens module (outgoing, EMSP → CPO).
 *
 * Uses the CPO Tokens "RECEIVER" endpoint from Utils.getAllEndpoints():
 *   - GET    /tokens
 *   - GET    /tokens/{country_code}/{party_id}/{token_uid}
 *   - PUT    /tokens/{country_code}/{party_id}/{token_uid}
 *   - PATCH  /tokens/{country_code}/{party_id}/{token_uid}
 *   - POST   /tokens/{country_code}/{party_id}/{token_uid}/authorize
 */
export default class OCPIv221TokensModuleOutgoingRequestService {
    private static async getCpoTokensBaseUrl(partnerId?: string): Promise<string> {
        return Utils.getOcpiEndpoint('tokens', 'RECEIVER', partnerId);
    }

    private static getAuthHeaders(
        cpoAuthToken: string,
        headers?: Record<string, string>,
    ): Record<string, string> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required to send OCPI token request');
        }
        const requestHeaders: Record<string, string> = {
            Authorization: `Token ${cpoAuthToken}`,
            ...(headers?.['X-Correlation-Id'] && { 'X-Correlation-Id': headers['X-Correlation-Id'] }),
            ...(headers?.['x-correlation-id'] && { 'X-Correlation-Id': headers['x-correlation-id'] }),
            ...(headers?.['X-Request-Id'] && { 'X-Request-Id': headers['X-Request-Id'] }),
            ...(headers?.['x-request-id'] && { 'X-Request-Id': headers['x-request-id'] }),
        };
        return requestHeaders;
    }

    /**
     * GET /tokens – list tokens from CPO.
     */
    public static async sendGetTokens(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokensResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendGetTokens', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetTokens in OCPIv221TokensModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO tokens base URL in sendGetTokens`, { data: logData });
            const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
                partnerId,
            );

            logger.debug(`🟡 [${reqId}] Building query parameters in sendGetTokens`, { 
                data: { ...logData, query: req.query } 
            });
            const params = new globalThis.URLSearchParams();
            if (req.query.offset) params.append('offset', String(req.query.offset));
            if (req.query.limit) params.append('limit', String(req.query.limit));
            if (req.query.date_from) params.append('date_from', String(req.query.date_from));
            if (req.query.date_to) params.append('date_to', String(req.query.date_to));
            if (req.query.country_code) params.append('country_code', String(req.query.country_code));
            if (req.query.party_id) params.append('party_id', String(req.query.party_id));

            const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /tokens in sendGetTokens`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken, req.headers as Record<string, string>),
                partnerId,
                requestCommand: OCPILogCommand.SendGetTokensReq,
                responseCommand: OCPILogCommand.SendGetTokensRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /tokens in sendGetTokens`, { 
                data: { ...logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPITokensResponse;

            logger.debug(`🟢 [${reqId}] Returning sendGetTokens response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetTokens: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * GET /tokens/{country_code}/{party_id}/{token_uid}
     */
    public static async sendGetToken(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendGetToken', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetToken in OCPIv221TokensModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO tokens base URL in sendGetToken`, { data: logData });
            const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
                partnerId,
            );
            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };

            logger.debug(`🟡 [${reqId}] Building query parameters in sendGetToken`, { 
                data: { ...logData, country_code, party_id, token_uid, query: req.query } 
            });
            const params = new globalThis.URLSearchParams();
            if (req.query.type) params.append('type', String(req.query.type));

            const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}`;
            const url = params.toString() ? `${path}?${params.toString()}` : path;

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /tokens/:token_uid in sendGetToken`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken, req.headers as Record<string, string>),
                partnerId,
                requestCommand: OCPILogCommand.SendGetTokenReq,
                responseCommand: OCPILogCommand.SendGetTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /tokens/:token_uid in sendGetToken`, { 
                data: { ...logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPITokenResponse;

            logger.debug(`🟢 [${reqId}] Returning sendGetToken response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetToken: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * PUT /tokens/{country_code}/{party_id}/{token_uid}
     */
    public static async sendPutToken(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPutToken', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPutToken in OCPIv221TokensModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO tokens base URL in sendPutToken`, { data: logData });
            const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
                partnerId,
            );
            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };
            const token = req.body as OCPIToken;

            logger.debug(`🟡 [${reqId}] Parsing PUT token payload in sendPutToken`, { 
                data: { ...logData, country_code, party_id, token_uid, token } 
            });

            const params = new globalThis.URLSearchParams();
            if (req.query.type) params.append('type', String(req.query.type));

            const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}`;
            const url = params.toString() ? `${path}?${params.toString()}` : path;

            logger.debug(`🟡 [${reqId}] Sending PUT request to CPO /tokens/:token_uid in sendPutToken`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendPutRequest({
                url,
                headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken, req.headers as Record<string, string>),
                data: token,
                partnerId,
                requestCommand: OCPILogCommand.SendPutTokenReq,
                responseCommand: OCPILogCommand.SendPutTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /tokens/:token_uid in sendPutToken`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payload = response as OCPIResponsePayload<OCPIToken>;

            logger.debug(`🟢 [${reqId}] Returning sendPutToken response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPutToken: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Direct helper for admin or internal callers:
     * Sends a PUT /tokens/{country_code}/{party_id}/{token_uid} with the given OCPIToken.
     */
    public static async sendPutTokenDirect(
        token: OCPIToken,
        cpoAuthToken: string,
        partnerId: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIToken>>> {
        const reqId = headers?.['x-correlation-id'] || headers?.['X-Correlation-Id'] || headers?.['x-request-id'] || headers?.['X-Request-Id'] || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPutTokenDirect', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPutTokenDirect in OCPIv221TokensModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO tokens base URL in sendPutTokenDirect`, { data: logData });
            const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
                partnerId,
            );
            const path = `${baseUrl}/${token.country_code}/${token.party_id}/${token.uid}`;

            logger.debug(`🟡 [${reqId}] Sending PUT request to CPO /tokens/:token_uid (direct) in sendPutTokenDirect`, { 
                data: { ...logData, url: path, token } 
            });
            const response = await OCPIOutgoingRequestService.sendPutRequest({
                url: path,
                headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken, headers),
                data: token,
                partnerId,
                requestCommand: OCPILogCommand.SendPutTokenDirectReq,
                responseCommand: OCPILogCommand.SendPutTokenDirectRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /tokens/:token_uid (direct) in sendPutTokenDirect`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payload = response as OCPIResponsePayload<OCPIToken>;

            logger.debug(`🟢 [${reqId}] Returning sendPutTokenDirect response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPutTokenDirect: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * PATCH /tokens/{country_code}/{party_id}/{token_uid}
     */
    public static async sendPatchToken(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPatchToken', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPatchToken in OCPIv221TokensModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO tokens base URL in sendPatchToken`, { data: logData });
            const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
                partnerId,
            );
            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };
            const patch = req.body as Partial<OCPIToken>;

            logger.debug(`🟡 [${reqId}] Parsing PATCH token payload in sendPatchToken`, { 
                data: { ...logData, country_code, party_id, token_uid, patch } 
            });

            const params = new globalThis.URLSearchParams();
            if (req.query.type) params.append('type', String(req.query.type));

            const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}`;
            const url = params.toString() ? `${path}?${params.toString()}` : path;

            logger.debug(`🟡 [${reqId}] Sending PATCH request to CPO /tokens/:token_uid in sendPatchToken`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendPatchRequest({
                url,
                headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
                data: patch,
                partnerId,
                requestCommand: OCPILogCommand.SendPatchTokenReq,
                responseCommand: OCPILogCommand.SendPatchTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /tokens/:token_uid in sendPatchToken`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payload = response as OCPIResponsePayload<OCPIToken>;

            logger.debug(`🟢 [${reqId}] Returning sendPatchToken response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPatchToken: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * POST /tokens/{country_code}/{party_id}/{token_uid}/authorize
     */
    public static async sendPostAuthorizeToken(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPostAuthorizeToken', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPostAuthorizeToken in OCPIv221TokensModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO tokens base URL in sendPostAuthorizeToken`, { data: logData });
            const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
                partnerId,
            );
            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };
            const location = req.body as OCPILocationReferences | undefined;

            logger.debug(`🟡 [${reqId}] Parsing POST authorize token payload in sendPostAuthorizeToken`, { 
                data: { ...logData, country_code, party_id, token_uid, location } 
            });

            const params = new globalThis.URLSearchParams();
            if (req.query.type) params.append('type', String(req.query.type));

            const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}/authorize`;
            const url = params.toString() ? `${path}?${params.toString()}` : path;

            logger.debug(`🟡 [${reqId}] Sending POST request to CPO /tokens/:token_uid/authorize in sendPostAuthorizeToken`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendPostRequest({
                url,
                headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
                data: location,
                partnerId,
                requestCommand: OCPILogCommand.SendPostAuthorizeTokenReq,
                responseCommand: OCPILogCommand.SendPostAuthorizeTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /tokens/:token_uid/authorize in sendPostAuthorizeToken`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payload = response as OCPIAuthorizationInfoResponse;

            logger.debug(`🟢 [${reqId}] Returning sendPostAuthorizeToken response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPostAuthorizeToken: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}
