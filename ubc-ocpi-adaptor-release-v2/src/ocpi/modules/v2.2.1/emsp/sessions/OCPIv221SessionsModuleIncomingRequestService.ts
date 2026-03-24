import { Request, Response } from 'express';
import { Session as PrismaSession, Prisma, OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPISessionResponse,
    OCPISessionsResponse,
} from '../../../../schema/modules/sessions/types/responses';
import { OCPISession, OCPIPatchSession } from '../../../../schema/modules/sessions/types';
import { databaseService } from '../../../../../services/database.service';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIAuthMethod } from '../../../../schema/modules/cdrs/enums';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import ChargingService from '../../../../../ubc/actions/services/ChargingService';
import { SessionService } from './SessionService';
import { isEmpty } from 'lodash';
import { logger } from '../../../../../services/logger.service';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import TrackActionHandler from '../../../../../ubc/actions/handlers/TrackActionHandler';

/**
 * OCPI 2.2.1 – Sessions module (incoming, EMSP side).
 *
 * CPO → EMSP (Receiver interface):
 * - GET   /sessions
 * - GET   /sessions/{country_code}/{party_id}/{session_id}
 * - PUT   /sessions/{country_code}/{party_id}/{session_id}
 * - PATCH /sessions/{country_code}/{party_id}/{session_id}
 */
export default class OCPIv221SessionsModuleIncomingRequestService {
    /**
     * GET /sessions
     *
     * Optional OCPI endpoint to list sessions.
     * Supports date_from/date_to, country_code, party_id, offset, limit.
     */
    public static async handleGetSessions(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionsResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /sessions', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /sessions in handleGetSessions`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetSessionsReq,
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Parsing query parameters in handleGetSessions`, { 
                data: { logData, query: req.query } 
            });
            const {
                country_code,
                party_id,
                date_from,
                date_to,
                offset,
                limit,
            } = req.query as {
                country_code?: string;
                party_id?: string;
                date_from?: string;
                date_to?: string;
                offset?: string;
                limit?: string;
            };

            logger.debug(`🟡 [${reqId}] Building query filters in handleGetSessions`, { 
                data: { logData, filters: { country_code, party_id, date_from, date_to } } 
            });
            const where: Prisma.SessionWhereInput = {
                deleted: false,
                partner_id: partnerCredentials.partner_id,
            };

            if (country_code) {
                where.country_code = country_code;
            }
            if (party_id) {
                where.party_id = party_id;
            }
            if (date_from || date_to) {
                where.last_updated = {};
                if (date_from) {
                    where.last_updated.gte = new Date(date_from);
                }
                if (date_to) {
                    where.last_updated.lte = new Date(date_to);
                }
            }

            const skip = offset ? Number(offset) : 0;
            const take = limit ? Number(limit) : undefined;

            logger.debug(`🟡 [${reqId}] Fetching sessions from DB in handleGetSessions`, { 
                data: { logData, skip, take } 
            });
            const sessions = await prisma.session.findMany({
                where,
                orderBy: { last_updated: 'desc' },
                skip,
                take,
            });

            logger.debug(`🟢 [${reqId}] Fetched ${sessions.length} sessions from DB in handleGetSessions`, { 
                data: { logData, sessionsCount: sessions.length } 
            });

            logger.debug(`🟡 [${reqId}] Mapping Prisma sessions to OCPI format in handleGetSessions`, { data: logData });
            const data: OCPISession[] = sessions.map(
                OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi,
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
                command: OCPILogCommand.GetSessionsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /sessions response in handleGetSessions`, { 
                data: { logData, httpStatus: response.httpStatus, sessionsCount: data.length } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetSessions: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * GET /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async handleGetSession(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const prisma = databaseService.prisma;
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };
        const logData = { action: 'GET /sessions/:session_id', partnerId: partnerCredentials.partner_id, session_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /sessions/:session_id in handleGetSession`, { data: logData });

            // Log incoming request (non-blocking)
            // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetSessionReq,
                ocpi_session_id: session_id,
            });

            logger.debug(`🟡 [${reqId}] Finding session by OCPI ID in handleGetSession`, { data: logData });
            const session = await prisma.session.findFirst({
                where: {
                    country_code,
                    party_id,
                    cpo_session_id: session_id,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
            });

            if (!session) {
                logger.warn(`🟡 [${reqId}] Session not found in handleGetSession`, { data: logData });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Session not found',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                // Pass OCPI IDs from params - logging function will try to resolve them
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.GetSessionRes,
                    cpo_session_id: session_id, // session_id from params is the CPO's session ID
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma session to OCPI format in handleGetSession`, { data: logData });
            const data = OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(
                session,
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
                command: OCPILogCommand.GetSessionRes,
                session_id: session.id,
                authorization_reference: session.authorization_reference || undefined,
                cpo_session_id: session.cpo_session_id || undefined,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /sessions/:session_id response in handleGetSession`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetSession: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * PUT /sessions/{country_code}/{party_id}/{session_id}
     *
     * Create or fully replace a session. 
     */
    public static async handlePutSession(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const prisma = databaseService.prisma;
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };
        const logData = { action: 'PUT /sessions/:session_id', partnerId: partnerCredentials.partner_id, session_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PUT /sessions/:session_id in handlePutSession`, { data: logData });

            // Log incoming request (non-blocking)
            // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutSessionReq,
                ocpi_session_id: session_id,
            });

            logger.debug(`🟡 [${reqId}] Parsing PUT session payload in handlePutSession`, { 
                data: { logData, hasBody: !!req.body } 
            });
            const payload = req.body as OCPISession;

            if (
                !payload ||
                payload.country_code !== country_code ||
                payload.party_id !== party_id ||
                payload.id !== session_id
            ) {
                logger.warn(`🟡 [${reqId}] Path parameters and payload mismatch in handlePutSession`, { 
                    data: { logData, payload: { country_code: payload?.country_code, party_id: payload?.party_id, id: payload?.id }, 
                    params: { country_code, party_id, session_id } } 
                });
                const response = {
                    httpStatus: 400,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2000,
                        status_message: 'Path parameters and session payload must match',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                // Pass OCPI IDs from params/body - logging function will try to resolve them
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PutSessionRes,
                    cpo_session_id: session_id, // session_id from params is the CPO's session ID
                    authorization_reference: payload?.authorization_reference,
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Finding existing session by authorization_reference in handlePutSession`, { 
                data: { logData, authorization_reference: payload.authorization_reference } 
            });
            const existing = await prisma.session.findFirst({
                where: {
                    authorization_reference: payload.authorization_reference,
                    partner_id: partnerCredentials.partner_id,
                    deleted: false,
                },
            });

            logger.debug(`🟡 [${reqId}] ${existing ? 'Updating' : 'Creating'} session in handlePutSession`, { 
                data: { logData, sessionExists: !!existing } 
            });
            let stored: PrismaSession;
            if (existing) {
                // Build update fields - only include fields present in payload that have changed
                logger.debug(`🟡 [${reqId}] Building session update fields in handlePutSession`, { data: logData });
                const sessionUpdateFields = SessionService.buildSessionUpdateFields(payload, existing);
                // Only update if there are changes
                if (!isEmpty(sessionUpdateFields)) {
                    stored = await prisma.session.update({
                        where: { id: existing.id },
                        data: sessionUpdateFields,
                    });
                    logger.debug(`🟢 [${reqId}] Updated existing session in handlePutSession`, { 
                        data: { logData, sessionId: stored.id } 
                    });
                    TrackActionHandler.sendOnTrackToBAPONIX(stored?.authorization_reference ?? '');
                }
                else {
                    logger.debug(`🟡 [${reqId}] No changes detected, using existing session in handlePutSession`, { data: logData });
                    stored = existing;
                }
            }
            else {
                // Create new session - only include fields present in payload
                logger.debug(`🟡 [${reqId}] Building session create fields in handlePutSession`, { data: logData });
                const sessionCreateFields = SessionService.buildSessionCreateFields(payload, partnerCredentials.partner_id);
                stored = await prisma.session.create({
                    data: sessionCreateFields,
                });
                logger.debug(`🟢 [${reqId}] Created new session in handlePutSession`, { 
                    data: { logData, sessionId: stored.id } 
                });
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma session to OCPI format in handlePutSession`, { data: logData });
            const data =
                OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(stored);

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
                command: OCPILogCommand.PutSessionRes,
                session_id: stored.id,
                authorization_reference: stored.authorization_reference || undefined,
                cpo_session_id: stored.cpo_session_id || undefined,
            });

            logger.debug(`🟡 [${reqId}] Triggering auto cut-off check in handlePutSession`, { data: logData });
            ChargingService.autoCutOffChargingSession(stored);

            logger.debug(`🟢 [${reqId}] Returning PUT /sessions/:session_id response in handlePutSession`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePutSession: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    /**
     * PATCH /sessions/{country_code}/{party_id}/{session_id}
     *
     * Partial update of an existing session.
     *
     * Some CPOs may send PATCH as the first message (no prior PUT).
     * In that case, if the payload contains a full OCPI Session object,
     * we treat it as an upsert and create the Session.
     */
    public static async handlePatchSession(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const prisma = databaseService.prisma;
        const { session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };
        const logData = { action: 'PATCH /sessions/:session_id', partnerId: partnerCredentials.partner_id, session_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PATCH /sessions/:session_id in handlePatchSession`, { data: logData });

            // Log incoming request (non-blocking)
            // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchSessionReq,
                ocpi_session_id: session_id,
            });

            logger.debug(`🟡 [${reqId}] Parsing PATCH session payload in handlePatchSession`, { 
                data: { logData, hasBody: !!req.body } 
            });
            const patch = req.body as OCPIPatchSession;

            // Try finding the session by the session_id
            logger.debug(`🟡 [${reqId}] Finding session by CPO session_id in handlePatchSession`, { data: logData });
            let existing = await prisma.session.findFirst({
                where: {
                    cpo_session_id: session_id,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id
                },
            });

            if (!existing && !patch.authorization_reference) {
                // raise error
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Session not found and authorization_reference is not provided',
                        timestamp: new Date().toISOString(),
                    },
                    statusCode: 404,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PatchSessionRes,
                    cpo_session_id: session_id,
                    authorization_reference: patch.authorization_reference,
                });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'Session not found and authorization_reference is not provided',
                        timestamp: new Date().toISOString(),
                    },
                };
                return response;
            }

            if (!existing) {
                // Try finding using authorization_reference
                logger.debug(`🟡 [${reqId}] Session not found by session_id, trying authorization_reference in handlePatchSession`, { 
                    data: { logData, authorization_reference: patch.authorization_reference } 
                });
                existing = await prisma.session.findFirst({
                    where: {
                        authorization_reference: patch.authorization_reference,
                        deleted: false,
                        partner_id: partnerCredentials.partner_id
                    },
                });
            }

            if (!existing) {
                logger.warn(`🟡 [${reqId}] Session not found in handlePatchSession`, { data: logData });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                // Pass OCPI IDs from params/body - logging function will try to resolve them
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PatchSessionRes,
                    cpo_session_id: session_id, // session_id from params is the CPO's session ID
                    authorization_reference: patch.authorization_reference,
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Building session update fields in handlePatchSession`, { data: logData });
            // Build update fields - only include fields present in payload that have changed
            const sessionUpdateFields = SessionService.buildSessionUpdateFields(patch as OCPISession, existing);

            // Only update if there are changes
            logger.debug(`🟡 [${reqId}] ${!isEmpty(sessionUpdateFields) ? 'Updating' : 'No changes, skipping update'} session in handlePatchSession`, { 
                data: { logData, hasChanges: !isEmpty(sessionUpdateFields) } 
            });
            let stored = existing;
            if (!isEmpty(sessionUpdateFields)) {
                stored = await prisma.session.update({
                    where: { id: existing.id },
                    data: sessionUpdateFields,
                });
                logger.debug(`🟢 [${reqId}] Updated session in handlePatchSession`, { 
                    data: { logData, sessionId: stored.id } 
                });

                TrackActionHandler.sendOnTrackToBAPONIX(stored?.authorization_reference ?? '');
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma session to OCPI format in handlePatchSession`, { data: logData });
            const data =
                OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(stored);

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
                command: OCPILogCommand.PatchSessionRes,
                session_id: stored.id,
                authorization_reference: stored.authorization_reference || undefined,
                cpo_session_id: stored.cpo_session_id || undefined,
            });

            logger.debug(`🟡 [${reqId}] Triggering auto cut-off check in handlePatchSession`, { data: logData });
            ChargingService.autoCutOffChargingSession(stored);

            logger.debug(`🟢 [${reqId}] Returning PATCH /sessions/:session_id response in handlePatchSession`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePatchSession: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    private static mapPrismaSessionToOcpi(session: PrismaSession): OCPISession {
        return {
            country_code: session?.country_code ?? undefined,
            party_id: session?.party_id ?? undefined,
            id: session?.cpo_session_id ?? '',
            start_date_time: session?.start_date_time?.toISOString() ?? undefined,
            end_date_time: session?.end_date_time?.toISOString() ?? undefined,
            kwh: Number(session?.kwh ?? 0),
            cdr_token: session?.cdr_token as unknown as OCPISession['cdr_token'],
            auth_method: session?.auth_method as OCPIAuthMethod,
            authorization_reference: session.authorization_reference ?? undefined,
            location_id: session?.location_id ?? undefined,
            evse_uid: session?.evse_uid ?? undefined,
            connector_id: session?.connector_id ?? undefined,
            meter_id: session?.meter_id ?? undefined,
            currency: session?.currency ?? undefined,
            charging_periods:
                (session?.charging_periods as unknown as OCPISession['charging_periods']) ||
                undefined,
            total_cost: (session?.total_cost as unknown as OCPISession['total_cost']) || undefined,
            status: session?.status as OCPISession['status'],
            last_updated: session?.last_updated?.toISOString() ?? undefined,
        };
    }

    private static mapOcpiSessionToPrisma(
        session: OCPISession,
        partnerId: string,
    ): Prisma.SessionUncheckedCreateInput {
        return {
            country_code: session.country_code,
            party_id: session.party_id,
            cpo_session_id: session.id,
            start_date_time: session.start_date_time ? new Date(session.start_date_time) : null,
            end_date_time: session.end_date_time ? new Date(session.end_date_time) : null,
            kwh: new Prisma.Decimal(session.kwh),
            cdr_token: session.cdr_token as unknown as Prisma.InputJsonValue,
            auth_method: String(session.auth_method),
            authorization_reference: session.authorization_reference ?? null,
            location_id: session.location_id,
            evse_uid: session.evse_uid,
            connector_id: session.connector_id,
            meter_id: session.meter_id ?? null,
            currency: session.currency,
            charging_periods: session.charging_periods
                ? (session.charging_periods as unknown as Prisma.InputJsonValue)
                : undefined,
            total_cost: session.total_cost
                ? (session.total_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            status: String(session.status),
            last_updated: new Date(session.last_updated ?? new Date().toISOString()),
            deleted: false,
            deleted_at: null,
            created_at: undefined,
            updated_at: undefined,
            partner_id: partnerId,
            id: undefined,
        };
    }
}
