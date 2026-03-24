import { Request, Response } from 'express';
import { OCPIPartnerCredentials, Token } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPIAuthorizationInfoResponse,
    OCPITokenResponse,
    OCPITokensResponse,
} from '../../../../schema/modules/tokens/types/responses';
import { databaseService } from '../../../../../services/database.service';
import { OCPIAuthorizationInfo, OCPILocationReferences, OCPIToken } from '../../../../schema/modules/tokens/types';
import { OCPIAllowedType, OCPIWhitelistType } from '../../../../schema/modules/tokens/enums';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import { TokenService } from './TokenService';
import { isEmpty } from 'lodash';
import { logger } from '../../../../../services/logger.service';

/**
 * OCPI 2.2.1 – Tokens module (incoming, EMSP side).
 *
 * Endpoints implemented as in the OCPI spec:
 * - GET    /tokens
 * - GET    /tokens/{country_code}/{party_id}/{token_uid}
 * - PUT    /tokens/{country_code}/{party_id}/{token_uid}
 * - PATCH  /tokens/{country_code}/{party_id}/{token_uid}
 * - POST   /tokens/{country_code}/{party_id}/{token_uid}/authorize
 *
 * All responses use the standard OCPI response envelope.
 */
export default class OCPIv221TokensModuleIncomingRequestService {

    /**
     * GET /tokens
     *
     * Optional OCPI endpoint: return all tokens, optionally filtered by
     * country_code / party_id.
     */
    public static async handleGetTokens(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokensResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /tokens', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /tokens in handleGetTokens`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetTokensReq,
            });

            const { country_code, party_id } = req.query as {
                country_code?: string;
                party_id?: string;
            };

            logger.debug(`🟡 [${reqId}] Parsing query parameters in handleGetTokens`, { 
                data: { ...logData, country_code, party_id } 
            });

            const where: {
                deleted: boolean;
                partner_id: string;
                country_code?: string;
                party_id?: string;
            } = {
                deleted: false,
                partner_id: partnerCredentials.partner_id,
            };
            if (country_code) {
                where.country_code = country_code;
            }
            if (party_id) {
                where.party_id = party_id;
            }

            logger.debug(`🟡 [${reqId}] Fetching tokens from database in handleGetTokens`, { 
                data: { ...logData, where } 
            });
            const prismaTokens = await databaseService.prisma.token.findMany({
                where,
                orderBy: { last_updated: 'desc' },
            });

            logger.debug(`🟢 [${reqId}] Fetched ${prismaTokens.length} tokens from database in handleGetTokens`, { 
                data: { ...logData, tokenCount: prismaTokens.length } 
            });

            logger.debug(`🟡 [${reqId}] Mapping Prisma tokens to OCPI format in handleGetTokens`, { 
                data: { ...logData, prismaTokens } 
            });
            const data: OCPIToken[] = prismaTokens.map(
                OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi,
            );

            const response = {
                httpStatus: 200,
                payload: {
                    data,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetTokensRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /tokens response in handleGetTokens`, { 
                data: { ...logData, tokenCount: data.length, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetTokens: ${e?.toString()}`, e, {
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
     *
     * Returns a single token if it exists.
     */
    public static async handleGetToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /tokens/:token_uid', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /tokens/:token_uid in handleGetToken`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetTokenReq,
            });

            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };

            logger.debug(`🟡 [${reqId}] Finding token by OCPI ID in handleGetToken`, { 
                data: { ...logData, country_code, party_id, token_uid } 
            });
            const prismaToken = await databaseService.prisma.token.findFirst({
                where: {
                    country_code,
                    party_id,
                    uid: token_uid,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
            });

            if (!prismaToken) {
                logger.warn(`🟡 [${reqId}] Token not found in handleGetToken`, { 
                    data: { ...logData, country_code, party_id, token_uid } 
                });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Token not found',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.GetTokenRes,
                });

                logger.debug(`🟢 [${reqId}] Returning 404 response in handleGetToken`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma token to OCPI format in handleGetToken`, { 
                data: { ...logData, prismaToken } 
            });
            const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
                prismaToken,
            );

            const response = {
                httpStatus: 200,
                payload: {
                    data,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /tokens/:token_uid response in handleGetToken`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetToken: ${e?.toString()}`, e, {
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
     *
     * CPO asks the EMSP if a token may be used for starting a session at a specific location.
     * 
     * According to OCPI 2.2.1:
     * - Request body: OCPILocationReferences (location_id required, evse_uids optional)
     * - If token is unknown → HTTP 404 (Not Found)
     * - If token exists → return authorization info with allowed status
     * 
     * Authorization logic:
     * - Token must exist and be valid
     * - Whitelist type determines if token is allowed:
     *   - ALWAYS: Always allowed
     *   - ALLOWED: Allowed (online authorization)
     *   - ALLOWED_OFFLINE: Allowed offline
     *   - NEVER: Never allowed
     */
    public static async handlePostToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'POST /tokens/:token_uid/authorize', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting POST /tokens/:token_uid/authorize in handlePostToken`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostAuthorizeTokenReq,
            });

            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };

            // Request body should be OCPILocationReferences
            const locationReferences = req.body as OCPILocationReferences | undefined;

            logger.debug(`🟡 [${reqId}] Parsing POST token authorization payload in handlePostToken`, { 
                data: { ...logData, country_code, party_id, token_uid, locationReferences } 
            });

            // Validate request body if provided
            if (locationReferences && !locationReferences.location_id) {
                logger.warn(`🟡 [${reqId}] location_id is missing in request body in handlePostToken`, { data: logData });
            const response = {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'location_id is required in request body',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostAuthorizeTokenRes,
            });

                logger.debug(`🟢 [${reqId}] Returning 400 response in handlePostToken`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Finding token by OCPI ID in handlePostToken`, { 
                data: { ...logData, country_code, party_id, token_uid } 
            });
            const prismaToken = await databaseService.prisma.token.findFirst({
                where: {
                    country_code,
                    party_id,
                    uid: token_uid,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
            });

            // According to OCPI 2.2.1: If token is unknown, return 404 with status_2002
            if (!prismaToken) {
                logger.warn(`🟡 [${reqId}] Token not found in handlePostToken`, { 
                    data: { ...logData, country_code, party_id, token_uid } 
                });
            const response = {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2002, // Unknown token
                    status_message: 'Token not found',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostAuthorizeTokenRes,
            });

                logger.debug(`🟢 [${reqId}] Returning 404 response in handlePostToken`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma token to OCPI format in handlePostToken`, { 
                data: { ...logData, prismaToken } 
            });
            // Map Prisma token to OCPI token
            const token = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
                prismaToken,
            );

            logger.debug(`🟡 [${reqId}] Determining authorization status in handlePostToken`, { 
                data: { ...logData, tokenValid: prismaToken.valid, whitelist: prismaToken.whitelist } 
            });
            // Determine authorization status based on token validity, expiry, and whitelist
        // Note: Token model doesn't currently have expiry_date field, so expiry check is skipped
        // If expiry_date is added to the schema in the future, check it here:
        // if (prismaToken.expiry_date && prismaToken.expiry_date < new Date()) {
        //     allowed = OCPIAllowedType.NOT_ALLOWED;
        // }
        let allowed: OCPIAllowedType = OCPIAllowedType.NOT_ALLOWED;

        // Check token validity first
        if (prismaToken.valid) {
            // Token is valid, check whitelist type
            const whitelistType = prismaToken.whitelist as OCPIWhitelistType;
            
            switch (whitelistType) {
                case OCPIWhitelistType.ALWAYS:
                case OCPIWhitelistType.ALLOWED:
                    allowed = OCPIAllowedType.ALLOWED;
                    break;
                case OCPIWhitelistType.ALLOWED_OFFLINE:
                    // ALLOWED_OFFLINE: Token is allowed when CPO is offline
                    // For simplicity, we treat it as ALLOWED (common implementation)
                    // In a production system, you might check CPO online status via:
                    // - Request header (e.g., 'x-ocpi-cpo-online')
                    // - Partner metadata
                    // - Real-time connectivity check
                    allowed = OCPIAllowedType.ALLOWED;
                    break;
                case OCPIWhitelistType.NEVER:
                    allowed = OCPIAllowedType.NOT_ALLOWED;
                    break;
                default:
                    // Default to NOT_ALLOWED for unknown whitelist types
                    allowed = OCPIAllowedType.NOT_ALLOWED;
            }
        }

            // Calculate cache_until: CPO can cache this authorization decision for 5 minutes
            // This helps reduce authorization requests for the same token
            const cacheUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

            logger.debug(`🟢 [${reqId}] Authorization determined in handlePostToken`, { 
                data: { ...logData, allowed, cacheUntil } 
            });

            const info: OCPIAuthorizationInfo = {
                allowed,
                token,
                location: locationReferences, // Include location references from request (optional per spec)
                cache_until: cacheUntil, // Recommended: tells CPO how long to cache this authorization decision
            };

            const response = {
                httpStatus: 200,
                payload: {
                    data: info,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            // Note: For token authorization, we don't have a direct session/location ID to link
            // The location_id in locationReferences is an OCPI ID, not internal DB ID
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostAuthorizeTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Returning POST /tokens/:token_uid/authorize response in handlePostToken`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePostToken: ${e?.toString()}`, e, {
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
     *
     * Creates or fully replaces a token.
     */
    public static async handlePutToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'PUT /tokens/:token_uid', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PUT /tokens/:token_uid in handlePutToken`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutTokenReq,
            });

            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };
            const payload = req.body as OCPIToken;

            logger.debug(`🟡 [${reqId}] Parsing PUT token payload in handlePutToken`, { 
                data: { ...logData, country_code, party_id, token_uid, payload } 
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Checking for existing token in handlePutToken`, { 
                data: { ...logData, country_code, party_id, token_uid } 
            });
            const existing = await prisma.token.findFirst({
                where: {
                    country_code,
                    party_id,
                    uid: token_uid,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
            });

            let stored: Token;
            if (!existing) {
                logger.debug(`🟡 [${reqId}] Creating new token in handlePutToken`, { data: logData });
                // Create token if it doesn't exist - only include fields present in payload
                const tokenCreateFields = TokenService.buildTokenCreateFields(payload, partnerCredentials.partner_id);
                stored = await prisma.token.create({
                    data: tokenCreateFields,
                });
                logger.debug(`🟢 [${reqId}] Created new token in handlePutToken`, { 
                    data: { ...logData, tokenId: stored.id } 
                });
            }
            else {
                logger.debug(`🟡 [${reqId}] Updating existing token in handlePutToken`, { 
                    data: { ...logData, existingTokenId: existing.id } 
                });
                // Build update fields - only include fields present in payload that have changed
                const tokenUpdateFields = TokenService.buildTokenUpdateFields(payload, existing);
                // Only update if there are changes
                if (!isEmpty(tokenUpdateFields)) {
                    stored = await prisma.token.update({
                        where: { id: existing.id },
                        data: tokenUpdateFields,
                    });
                    logger.debug(`🟢 [${reqId}] Updated existing token in handlePutToken`, { 
                        data: { ...logData, tokenId: stored.id } 
                    });
                }
                else {
                    stored = existing;
                    logger.debug(`🟢 [${reqId}] No changes to token, using existing in handlePutToken`, { 
                        data: { ...logData, tokenId: stored.id } 
                    });
                }
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma token to OCPI format in handlePutToken`, { 
                data: { ...logData, stored } 
            });
            const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
                stored,
            );

            const response = {
                httpStatus: 200,
                payload: {
                    data,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            // Note: Token doesn't have a direct relation to location/evse/connector in the log schema
            // We only log the token operation itself
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Returning PUT /tokens/:token_uid response in handlePutToken`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePutToken: ${e?.toString()}`, e, {
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
     *
     * Applies a partial update to an existing token.
     */
    public static async handlePatchToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'PATCH /tokens/:token_uid', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PATCH /tokens/:token_uid in handlePatchToken`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchTokenReq,
            });

            const { country_code, party_id, token_uid } = req.params as {
                country_code: string;
                party_id: string;
                token_uid: string;
            };
            const patch = req.body as Partial<OCPIToken>;

            logger.debug(`🟡 [${reqId}] Parsing PATCH token payload in handlePatchToken`, { 
                data: { ...logData, country_code, party_id, token_uid, patch } 
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding existing token in handlePatchToken`, { 
                data: { ...logData, country_code, party_id, token_uid } 
            });
            const existing = await prisma.token.findFirst({
                where: {
                    country_code,
                    party_id,
                    uid: token_uid,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
            });

            if (!existing) {
                logger.warn(`🟡 [${reqId}] Token not found in handlePatchToken`, { 
                    data: { ...logData, country_code, party_id, token_uid } 
                });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Token not found',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PatchTokenRes,
                });

                logger.debug(`🟢 [${reqId}] Returning 404 response in handlePatchToken`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Building token update fields in handlePatchToken`, { 
                data: { ...logData, existingTokenId: existing.id } 
            });
            // Build update fields - only include fields present in payload that have changed
            const tokenUpdateFields = TokenService.buildTokenUpdateFields(patch as OCPIToken, existing);

            // Only update if there are changes
            let stored = existing;
            if (!isEmpty(tokenUpdateFields)) {
                logger.debug(`🟡 [${reqId}] Updating token in handlePatchToken`, { 
                    data: { ...logData, tokenId: existing.id, tokenUpdateFields } 
                });
                stored = await prisma.token.update({
                    where: { id: existing.id },
                    data: tokenUpdateFields,
                });
                logger.debug(`🟢 [${reqId}] Updated token in handlePatchToken`, { 
                    data: { ...logData, tokenId: stored.id } 
                });
            }
            else {
                logger.debug(`🟢 [${reqId}] No changes to token, using existing in handlePatchToken`, { 
                    data: { ...logData, tokenId: stored.id } 
                });
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma token to OCPI format in handlePatchToken`, { 
                data: { ...logData, stored } 
            });
            const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
                stored,
            );

            const response = {
                httpStatus: 200,
                payload: {
                    data,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchTokenRes,
            });

            logger.debug(`🟢 [${reqId}] Returning PATCH /tokens/:token_uid response in handlePatchToken`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePatchToken: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    private static mapPrismaTokenToOcpi(token: Token): OCPIToken {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: token.type as never,
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? undefined,
            issuer: token.issuer,
            group_id: token.group_id ?? undefined,
            valid: token.valid,
            whitelist: token.whitelist as never,
            language: token.language ?? undefined,
            default_profile_type: (token.default_profile_type as never) || undefined,
            energy_contract: token.energy_contract as never,
            last_updated: token.last_updated.toISOString(),
        };
    }

    private static mapOcpiTokenToPrisma(token: OCPIToken, partnerId: string) {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: String(token.type),
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? null,
            issuer: token.issuer,
            group_id: token.group_id ?? null,
            valid: token.valid,
            whitelist: String(token.whitelist),
            language: token.language ?? null,
            default_profile_type: token.default_profile_type
                ? String(token.default_profile_type)
                : null,
            energy_contract: (token.energy_contract as unknown) ?? undefined,
            last_updated: new Date(token.last_updated ?? new Date().toISOString()),
            deleted: false,
            partner_id: partnerId,
        };
    }
}

