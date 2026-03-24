import { Request, Response } from 'express';
import { OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../../types/responses';
import { OCPIResponseStatusCode, OCPIRole } from '../../../schema/general/enum';
import CountryCode from '../../../schema/general/enum/country-codes';
import { OCPIResponsePayload } from '../../../schema/general/types/responses';
import {
    OCPICredentials,
    OCPICredentialsPatchRequest,
} from '../../../schema/modules/credentials/types';
import { databaseService } from '../../../../services/database.service';
import { OCPIRequestLogService } from '../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../types';
import { logger } from '../../../../services/logger.service';

/**
 * OCPI 2.2.1 Credentials module (incoming, EMSP side).
 *
 * File name and path follow the existing convention:
 *   src/ocpi/modules/v2.2.1/credentials/OCPIv221CredentialsModuleIncomingRequestService.ts
 */
export default class OCPIv221CredentialsModuleIncomingRequestService {
    /**
     * POST /ocpi/credentials
     *
     * NOTE: For historical reasons the router calls this "handleGetCredentials",
     * but this method is actually the handler for the POST /credentials endpoint.
     *
     * CPO calls this endpoint to send its credentials. We:
     * - Store / update the partner and its credentials in the database
     * - Generate our EMSP credentials object
     * - Return our EMSP credentials to the CPO
     */
    public static async handlePostCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'POST /credentials', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting POST /credentials in handlePostCredentials`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostCredentialsReq,
            });

            logger.debug(`🟡 [${reqId}] Parsing incoming credentials payload in handlePostCredentials`, { 
                data: { logData, hasBody: !!req.body } 
            });
            const incoming = req.body as OCPICredentials;

            logger.debug(`🟡 [${reqId}] Processing incoming credentials in handlePostCredentials`, { 
                data: { logData, incoming: { token: incoming?.token ? '***' : undefined, url: incoming?.url, rolesCount: incoming?.roles?.length } } 
            });
            const emspCredentials = await OCPIv221CredentialsModuleIncomingRequestService.processIncomingCredentials(
                incoming,
                partnerCredentials,
            );

            logger.debug(`🟢 [${reqId}] Successfully processed credentials in handlePostCredentials`, { 
                data: { logData, emspCredentials: { token: emspCredentials?.token ? '***' : undefined, url: emspCredentials?.url } } 
            });

            const response = {
                httpStatus: 200,
                payload: {
                    data: emspCredentials,
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
                command: OCPILogCommand.PostCredentialsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning POST /credentials response in handlePostCredentials`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePostCredentials: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * GET /ocpi/credentials
     *
     * CPO calls this endpoint to retrieve this EMSP's current credentials.
     * We identify the partner by the Authorization header (Token <emsp_auth_token>).
     */
    public static async handleGetCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /credentials', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /credentials in handleGetCredentials`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetCredentialsReq,
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Fetching partner credentials from DB in handleGetCredentials`, { data: logData });
            const dbCreds = await prisma.oCPIPartnerCredentials.findUnique({
                where: { partner_id: partnerCredentials.partner_id },
            });

            if (!dbCreds) {
                logger.warn(`🟡 [${reqId}] Partner credentials not found in handleGetCredentials`, { data: logData });
                const response = {
                    httpStatus: 401,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Unauthorized',
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
                    command: OCPILogCommand.GetCredentialsRes,
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Fetching EMSP partner from DB in handleGetCredentials`, { data: logData });
            const emspPartner = await prisma.oCPIPartner.findFirst({
                where: {
                    role: 'EMSP',
                    deleted: false,
                },
            });

            logger.debug(`🟡 [${reqId}] Building EMSP credentials response in handleGetCredentials`, { 
                data: { logData, emspPartnerFound: !!emspPartner } 
            });
            const emspCredentials: OCPICredentials = {
                token: dbCreds.emsp_auth_token || '',
                url: dbCreds.emsp_url || '',
                roles: [
                    {
                        country_code: emspPartner?.country_code as CountryCode,
                        party_id: emspPartner?.party_id as string,
                        role: OCPIRole.EMSP,
                        business_details: {
                            name: emspPartner?.name || '',
                        }
                    },
                ],
            };

            const response = {
                httpStatus: 200,
                payload: {
                    data: emspCredentials,
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
                command: OCPILogCommand.GetCredentialsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /credentials response in handleGetCredentials`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetCredentials: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * PUT /ocpi/credentials
     *
     * CPO sends a full credentials object to replace/update its credentials.
     * Behavior is identical to POST /ocpi/credentials on the EMSP side.
     */
    public static async handlePutCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'PUT /credentials', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PUT /credentials in handlePutCredentials`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutCredentialsReq,
            });

            logger.debug(`🟡 [${reqId}] Parsing incoming credentials payload in handlePutCredentials`, { 
                data: { logData, hasBody: !!req.body } 
            });
            const incoming = req.body as OCPICredentials;

            logger.debug(`🟡 [${reqId}] Processing incoming credentials in handlePutCredentials`, { 
                data: { logData, incoming: { token: incoming?.token ? '***' : undefined, url: incoming?.url, rolesCount: incoming?.roles?.length } } 
            });
            const emspCredentials = await OCPIv221CredentialsModuleIncomingRequestService.processIncomingCredentials(
                incoming,
                partnerCredentials,
            );

            logger.debug(`🟢 [${reqId}] Successfully processed credentials in handlePutCredentials`, { 
                data: { logData, emspCredentials: { token: emspCredentials?.token ? '***' : undefined, url: emspCredentials?.url } } 
            });

            const response = {
                httpStatus: 200,
                payload: {
                    data: emspCredentials,
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
                command: OCPILogCommand.PutCredentialsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning PUT /credentials response in handlePutCredentials`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePutCredentials: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * PATCH /ocpi/credentials
     *
     * CPO sends a partial credentials object to rotate its token.
     * OCPI allows only the token field to be patched for credentials.
     *
     * We:
     * - Identify the partner by Authorization header (old CPO token)
     * - Update stored cpo_auth_token to the new token
     * - Return this EMSP's credentials
     */
    public static async handlePatchCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'PATCH /credentials', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PATCH /credentials in handlePatchCredentials`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchCredentialsReq,
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Parsing PATCH payload in handlePatchCredentials`, { 
                data: { logData, hasBody: !!req.body } 
            });
            const patch = req.body as OCPICredentialsPatchRequest;

            if (!patch) {
                logger.warn(`🟡 [${reqId}] PATCH payload is missing in handlePatchCredentials`, { data: logData });
                const response = {
                    httpStatus: 400,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2000,
                        status_message: 'PATCH /credentials payload is required',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response
                try {
                    const safePayload = JSON.parse(
                        JSON.stringify(response.payload, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)),
                    );
                    await OCPIRequestLogService.logIncomingResponse({
                        req,
                        res,
                        responseBody: safePayload,
                        statusCode: response.httpStatus,
                        partnerId: partnerCredentials.partner_id,
                        command: OCPILogCommand.PatchCredentialsRes,
                    });
                }
                catch (logError) {
                    logger.error('Failed to persist OCPI outgoing log', logError as Error);
                }

                return response;
            }

            logger.debug(`🟡 [${reqId}] Fetching existing credentials from DB in handlePatchCredentials`, { data: logData });
            const existingCreds = await prisma.oCPIPartnerCredentials.findUnique({
                where: { partner_id: partnerCredentials.partner_id },
            });

            if (!existingCreds) {
                logger.warn(`🟡 [${reqId}] Existing credentials not found in handlePatchCredentials`, { data: logData });
                const response = {
                    httpStatus: 401,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Unauthorized',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response
                try {
                    const safePayload = JSON.parse(
                        JSON.stringify(response.payload, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)),
                    );
                    await OCPIRequestLogService.logIncomingResponse({
                        req,
                        res,
                        responseBody: safePayload,
                        statusCode: response.httpStatus,
                        partnerId: partnerCredentials.partner_id,
                        command: OCPILogCommand.PatchCredentialsRes,
                    });
                }
                catch (logError) {
                    logger.error('Failed to persist OCPI outgoing log', logError as Error);
                }

                return response;
            }

            logger.debug(`🟡 [${reqId}] Updating partner credentials in DB in handlePatchCredentials`, { data: logData });
            const updatedCreds = await prisma.oCPIPartnerCredentials.update({
                where: { partner_id: existingCreds.partner_id },
                data: {
                    cpo_auth_token: patch?.token || existingCreds.cpo_auth_token,
                    cpo_url: patch?.url || existingCreds.cpo_url,
                },
            });

            // update cpo partner name
            logger.debug(`🟡 [${reqId}] Checking for CPO role in PATCH payload in handlePatchCredentials`, { data: logData });
            const cpoRole = patch.roles?.find((role) => role.role === OCPIRole.CPO);

            if (cpoRole) {
                logger.debug(`🟡 [${reqId}] Updating CPO partner details in handlePatchCredentials`, { data: logData });
                const partner = await prisma.oCPIPartner.findUnique({
                    where: { id: existingCreds.partner_id },
                });
                await prisma.oCPIPartner.update({
                    where: { id: existingCreds.partner_id },
                    data: {
                        name: cpoRole.business_details?.name || '',
                        country_code: cpoRole.country_code as CountryCode,
                        party_id: cpoRole.party_id as string,
                        versions_url: patch?.url || partner?.versions_url || '',
                    },
                });
            }

            logger.debug(`🟡 [${reqId}] Fetching EMSP partner from DB in handlePatchCredentials`, { data: logData });
            const emspPartner = await prisma.oCPIPartner.findFirst({
                where: {
                    role: 'EMSP',
                    deleted: false,
                },
            });

            logger.debug(`🟡 [${reqId}] Building EMSP credentials response in handlePatchCredentials`, { 
                data: { logData, emspPartnerFound: !!emspPartner } 
            });
            const emspCredentials: OCPICredentials = {
                token: updatedCreds.emsp_auth_token || '',
                url: updatedCreds.emsp_url || '',
                roles: [
                    {
                        country_code: emspPartner?.country_code as CountryCode,
                        party_id: emspPartner?.party_id as string,
                        role: OCPIRole.EMSP,
                    },
                ],
            };

            const response = {
                httpStatus: 200,
                payload: {
                    data: emspCredentials,
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
                command: OCPILogCommand.PatchCredentialsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning PATCH /credentials response in handlePatchCredentials`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePatchCredentials: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * Shared worker for POST and PUT /ocpi/credentials.
     * Processes incoming CPO credentials, keeps partner + credentials in sync,
     * and returns this EMSP's credentials object.
     */
    private static async processIncomingCredentials(
        incoming: OCPICredentials,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<OCPICredentials> {
        const reqId = 'process-credentials';
        const logData = { action: 'processIncomingCredentials', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting processIncomingCredentials`, { data: logData });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding CPO role in incoming credentials`, { data: logData });
            const cpoRole = incoming.roles.find((role) => role.role === OCPIRole.CPO);

            // Basic validation: OCPI requires at least one role.
            if (!cpoRole) {
                logger.error(`🔴 [${reqId}] No CPO role found in credentials payload`, undefined, { data: logData });
                throw new Error('At least one role is required in credentials payload');
            }

            logger.debug(`🟡 [${reqId}] Updating CPO credentials in DB`, { data: logData });
            // 3) Update CPO credentials row for this partner – store CPO token/URL.
            const updatedCreds = await prisma.oCPIPartnerCredentials.update({
                where: { partner_id: partnerCredentials.partner_id },
                data: {
                    cpo_auth_token: incoming.token,
                    cpo_url: incoming.url,
                },
            });

            logger.debug(`🟡 [${reqId}] Updating CPO partner details in DB`, { data: logData });
            // update cpo partner name
            await prisma.oCPIPartner.update({
                where: { id: partnerCredentials.partner_id },
                data: {
                    name: cpoRole.business_details?.name || '',
                    country_code: cpoRole.country_code as CountryCode,
                    party_id: cpoRole.party_id as string,
                    versions_url: incoming.url,
                },
            });

            logger.debug(`🟡 [${reqId}] Fetching EMSP partner from DB`, { data: logData });
            const emspPartner = await prisma.oCPIPartner.findFirst({
                where: {
                    role: 'EMSP',
                    deleted: false,
                },
            });

            logger.debug(`🟢 [${reqId}] Successfully processed incoming credentials`, { 
                data: { logData, emspPartnerFound: !!emspPartner } 
            });

            return {
                token: updatedCreds.emsp_auth_token || '',
                url: updatedCreds.emsp_url || '',
                roles: [
                    {
                        country_code: emspPartner?.country_code as CountryCode,
                        party_id: emspPartner?.party_id as string,
                        role: OCPIRole.EMSP,
                        business_details: {
                            name: emspPartner?.name || '',
                        }
                    },
                ],
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in processIncomingCredentials: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }
}