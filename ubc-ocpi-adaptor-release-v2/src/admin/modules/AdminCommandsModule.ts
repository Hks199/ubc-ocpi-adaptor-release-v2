import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../services/logger.service';
import CommandsService, {
    StartChargingCommandParams,
    StopChargingCommandParams,
} from '../../services/CommandsService';
import { randomUUID } from 'crypto';

/**
 * Admin Commands module
 *
 * Responsibility:
 *  - Accept high-level command parameters (location, EVSE, connector, etc.) from admin APIs
 *  - Delegate to CommandsService which:
 *      - Resolves target CPO partner via partner_id
 *      - Fetches CPO auth token from OCPIPartnerCredentials
 *      - Generates OCPI Start/Stop command payloads
 *      - Calls the OCPI Commands outgoing service (EMSP → CPO)
 */
export default class AdminCommandsModule {

    /**
     * Admin API: Start charging session
     *
     * POST /api/admin/commands/start
     *
     * Body:
     *  - partner_id: string (required)
     *  - location_id: string (required)
     *  - evse_uid: string (required)
     *  - connector_id: string (required)
     *  - transaction_id: string (required) – used as authorization_reference
     */
    public static async startCharging(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<any>>> {
        // Ensure headers exist
        if (!req.headers) {
            req.headers = {};
        }

        // Generate request/correlation IDs if missing (case-insensitive check)
        const correlationId = req.headers['x-correlation-id'] as string || req.headers['X-Correlation-Id'] as string;
        const requestId = req.headers['x-request-id'] as string || req.headers['X-Request-Id'] as string;

        // Generate correlation ID if missing
        if (!correlationId) {
            const newCorrelationId = randomUUID();
            req.headers['x-correlation-id'] = newCorrelationId;
            req.headers['X-Correlation-Id'] = newCorrelationId;
        }

        // Generate request ID if missing
        if (!requestId) {
            const newRequestId = randomUUID();
            req.headers['x-request-id'] = newRequestId;
            req.headers['X-Request-Id'] = newRequestId;
        }

        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'startCharging' };

        try {
            logger.debug(`🟡 [${reqId}] Starting startCharging in AdminCommandsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in startCharging`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const {
                partner_id: partnerId,
                location_id: locationId,
                evse_uid: evseUid,
                connector_id: connectorId,
                transaction_id: transactionId,
            } = req.body as {
                partner_id?: string;
                location_id?: string;
                evse_uid?: string;
                connector_id?: string;
                transaction_id?: string;
            };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in startCharging`, { data: logData });
                throw new ValidationError('partner_id is required');
            }
            if (!locationId) {
                logger.warn(`🟡 [${reqId}] location_id missing in startCharging`, { data: logData });
                throw new ValidationError('location_id is required');
            }
            if (!evseUid) {
                logger.warn(`🟡 [${reqId}] evse_uid missing in startCharging`, { data: logData });
                throw new ValidationError('evse_uid is required');
            }
            if (!connectorId) {
                logger.warn(`🟡 [${reqId}] connector_id missing in startCharging`, { data: logData });
                throw new ValidationError('connector_id is required');
            }
            if (!transactionId) {
                logger.warn(`🟡 [${reqId}] transaction_id missing in startCharging`, { data: logData });
                throw new ValidationError('transaction_id is required');
            }

            const params: StartChargingCommandParams = {
                partnerId,
                locationId,
                evseUid,
                connectorId,
                transactionId,
                headers: req.headers as Record<string, string>,
            };

            logger.debug(`🟡 [${reqId}] Starting charging session via CommandsService in startCharging`, { 
                data: { ...logData, params } 
            });
            const cpoResponse = await CommandsService.startSession(params);

            logger.debug(`🟢 [${reqId}] Received response from CommandsService in startCharging`, { 
                data: { ...logData, httpStatus: cpoResponse.httpStatus } 
            });

            logger.debug(`🟢 [${reqId}] Returning startCharging response`, { 
                data: { ...logData, httpStatus: cpoResponse.httpStatus } 
            });

            return {
                httpStatus: cpoResponse.httpStatus,
                headers: cpoResponse.headers,
                payload: {
                    data: cpoResponse.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in startCharging: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Admin API: Stop charging session
     *
     * POST /api/admin/commands/stop
     *
     * Body:
     *  - partner_id: string (required)
     *  - session_id: string (required) – CPO-generated OCPI Session.id
     */
    public static async stopCharging(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<any>>> {
        // Ensure headers exist
        if (!req.headers) {
            req.headers = {};
        }

        // Generate request/correlation IDs if missing (case-insensitive check)
        const correlationId = req.headers['x-correlation-id'] as string || req.headers['X-Correlation-Id'] as string;
        const requestId = req.headers['x-request-id'] as string || req.headers['X-Request-Id'] as string;

        // Generate correlation ID if missing
        if (!correlationId) {
            const newCorrelationId = randomUUID();
            req.headers['x-correlation-id'] = newCorrelationId;
            req.headers['X-Correlation-Id'] = newCorrelationId;
        }

        // Generate request ID if missing
        if (!requestId) {
            const newRequestId = randomUUID();
            req.headers['x-request-id'] = newRequestId;
            req.headers['X-Request-Id'] = newRequestId;
        }

        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'stopCharging' };

        try {
            logger.debug(`🟡 [${reqId}] Starting stopCharging in AdminCommandsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in stopCharging`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const {
                partner_id: partnerId,
                session_id: sessionId,
            } = req.body as {
                partner_id?: string;
                session_id?: string;
            };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in stopCharging`, { data: logData });
                throw new ValidationError('partner_id is required');
            }
            if (!sessionId) {
                logger.warn(`🟡 [${reqId}] session_id missing in stopCharging`, { data: logData });
                throw new ValidationError('session_id is required');
            }

            const params: StopChargingCommandParams = {
                partnerId,
                sessionId,
                headers: req.headers as Record<string, string>,
            };

            logger.debug(`🟡 [${reqId}] Stopping charging session via CommandsService in stopCharging`, { 
                data: { ...logData, params } 
            });
            const cpoResponse = await CommandsService.stopSession(params);

            logger.debug(`🟢 [${reqId}] Received response from CommandsService in stopCharging`, { 
                data: { ...logData, httpStatus: cpoResponse.httpStatus } 
            });

            logger.debug(`🟢 [${reqId}] Returning stopCharging response`, { 
                data: { ...logData, httpStatus: cpoResponse.httpStatus } 
            });

            return {
                httpStatus: cpoResponse.httpStatus,
                headers: cpoResponse.headers,
                payload: {
                    data: cpoResponse.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in stopCharging: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}


