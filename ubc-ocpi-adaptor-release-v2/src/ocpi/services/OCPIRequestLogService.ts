import { Request, Response } from 'express';
import { OCPILogDbService } from '../../db-services/OCPILogDbService';
import { OCPIPartnerCredentials } from '@prisma/client';
import { OCPILogCommand } from '../types';
import { logger } from '../../services/logger.service';
import { databaseService } from '../../services/database.service';

export class OCPIRequestLogService {
    /**
     * Safely execute a logging function without blocking or throwing errors
     * This ensures logging failures never affect the main request/response flow
     */
    private static safeLog(logFn: () => Promise<void>): void {
        // Execute asynchronously without blocking
        Promise.resolve().then(() => {
            return logFn();
        }).catch((error) => {
            // Double safety: catch any unhandled promise rejections
            // The logging functions already have try-catch, but this is extra protection
            logger.error('Unhandled error in logging function', error as Error);
        });
    }

    private static toSafeJson<T>(value: T): T {
        // Ensure payload is JSON-serializable (strip functions, undefined, etc.)
        return JSON.parse(
            JSON.stringify(value, (_key, v) => {
                if (typeof v === 'bigint') {
                    return Number(v);
                }
                if (v instanceof Error) {
                    return {
                        name: v.name,
                        message: v.message,
                        stack: v.stack,
                    };
                }
                return v;
            }),
        );
    }

    /**
     * Log incoming OCPI request (CPO → EMSP)
     * Sender type is always CPO for incoming requests
     */
    public static async logIncomingRequest(params: {
        req: Request;
        partnerId?: string;
        command: OCPILogCommand;
        // Internal DB IDs (if already resolved)
        location_id?: string;
        evse_id?: string;
        connector_id?: string;
        session_id?: string;
        // OCPI IDs (will be resolved to internal DB IDs)
        ocpi_location_id?: string;
        ocpi_evse_uid?: string;
        ocpi_connector_id?: string;
        ocpi_session_id?: string;
        authorization_reference?: string;
        cpo_session_id?: string;
    }): Promise<void> {
        try {
            const {
                req,
                partnerId,
                command,
                location_id,
                evse_id,
                connector_id,
                session_id,
                ocpi_location_id,
                ocpi_evse_uid,
                ocpi_connector_id,
                ocpi_session_id,
                authorization_reference,
                cpo_session_id,
            } = params;

            const authReq = req as Request & {
                ocpiPartnerCredentials?: OCPIPartnerCredentials;
            };

            const resolvedPartnerId = partnerId ?? authReq.ocpiPartnerCredentials?.partner_id;
            if (!resolvedPartnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            const payload = this.toSafeJson({
                method: req.method,
                path: req.path,
                query: req.query,
                headers: req.headers,
                body: req.body,
            });

            const url = (req as any).originalUrl ?? req.url;

            // Build log data with relations
            const logData: any = {
                command,
                sender_type: 'CPO', // Always CPO for incoming requests
                url,
                payload,
                partner: {
                    connect: { id: resolvedPartnerId },
                },
            };

            // Connect to IDs if provided (assume they are correct internal DB IDs)
            if (location_id) {
                logData.location = { connect: { id: location_id } };
            }
            if (evse_id) {
                logData.evse = { connect: { id: evse_id } };
            }
            if (connector_id) {
                logData.connector = { connect: { id: connector_id } };
            }
            if (session_id) {
                logData.session = { connect: { id: session_id } };
            }

            // Resolve OCPI IDs to internal DB IDs if provided
            if (ocpi_location_id && resolvedPartnerId && !location_id) {
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    logData.location = { connect: { id: location.id } };
                }
            }

            if (ocpi_evse_uid && ocpi_location_id && resolvedPartnerId && !evse_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        logData.evse = { connect: { id: evse.id } };
                        // Also set location if not already set
                        if (!logData.location) {
                            logData.location = { connect: { id: location.id } };
                        }
                    }
                }
            }

            if (ocpi_connector_id && ocpi_evse_uid && ocpi_location_id && resolvedPartnerId && !connector_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    // Then find EVSE
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        // Then find connector
                        const connector = await databaseService.prisma.eVSEConnector.findFirst({
                            where: {
                                evse_id: evse.id,
                                connector_id: ocpi_connector_id,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (connector) {
                            logData.connector = { connect: { id: connector.id } };
                            // Also set location and evse if not already set
                            if (!logData.location) {
                                logData.location = { connect: { id: location.id } };
                            }
                            if (!logData.evse) {
                                logData.evse = { connect: { id: evse.id } };
                            }
                        }
                    }
                }
            }

            // ocpi_session_id and cpo_session_id are the same - both refer to the CPO's session ID
            const sessionIdToResolve = ocpi_session_id || cpo_session_id;
            if (sessionIdToResolve && resolvedPartnerId && !session_id) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        cpo_session_id: sessionIdToResolve,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.session = { connect: { id: session.id } };
                }
            }

            // Resolve session IDs from authorization_reference if provided
            if (authorization_reference && resolvedPartnerId) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        authorization_reference: authorization_reference,
                        partner_id: resolvedPartnerId,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.authorization_reference_session = { connect: { id: session.id } };
                }
            }

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            // Silently fail - logging errors should not break the request flow
            logger.error('Failed to persist OCPI incoming request log', logError as Error, {
                path: params.req.path,
                method: params.req.method,
            });
        }
    }

    /**
     * Log incoming OCPI response (EMSP → CPO)
     * Sender type is always EMSP for incoming responses
     */
    public static async logIncomingResponse(params: {
        req: Request;
        res: Response;
        responseBody: any;
        statusCode: number;
        partnerId?: string;
        command: OCPILogCommand;
        location_id?: string;
        evse_id?: string;
        connector_id?: string;
        session_id?: string;
        // OCPI IDs (will be resolved to internal DB IDs)
        ocpi_location_id?: string;
        ocpi_evse_uid?: string;
        ocpi_connector_id?: string;
        ocpi_session_id?: string;
        authorization_reference?: string;
        cpo_session_id?: string;
    }): Promise<void> {
        try {
            const {
                req,
                res,
                responseBody,
                statusCode,
                partnerId,
                command,
                location_id,
                evse_id,
                connector_id,
                session_id,
                ocpi_location_id,
                ocpi_evse_uid,
                ocpi_connector_id,
                ocpi_session_id,
                authorization_reference,
                cpo_session_id,
            } = params;

            const authReq = req as Request & {
                ocpiPartnerCredentials?: OCPIPartnerCredentials;
            };

            const resolvedPartnerId = partnerId ?? authReq.ocpiPartnerCredentials?.partner_id;
            if (!resolvedPartnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            // Strip BigInt from payload so JSON.stringify does not fail
            const safePayload = JSON.parse(
                JSON.stringify(
                    responseBody,
                    (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
                ),
            );

            const payload = this.toSafeJson({
                method: req.method,
                headers: res.getHeaders(),
                responseBody: safePayload,
                statusCode,
            });

            const url = (req as any).originalUrl ?? req.url;

            // Build log data with relations
            const logData: any = {
                command,
                sender_type: 'EMSP', // Always EMSP for incoming responses
                url,
                payload,
                partner: {
                    connect: { id: resolvedPartnerId },
                },
            };

            // Connect to IDs if provided (assume they are correct internal DB IDs)
            if (location_id) {
                logData.location = { connect: { id: location_id } };
            }
            if (evse_id) {
                logData.evse = { connect: { id: evse_id } };
            }
            if (connector_id) {
                logData.connector = { connect: { id: connector_id } };
            }
            if (session_id) {
                logData.session = { connect: { id: session_id } };
            }

            // Resolve OCPI IDs to internal DB IDs if provided
            if (ocpi_location_id && resolvedPartnerId && !location_id) {
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    logData.location = { connect: { id: location.id } };
                }
            }

            if (ocpi_evse_uid && ocpi_location_id && resolvedPartnerId && !evse_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        logData.evse = { connect: { id: evse.id } };
                        // Also set location if not already set
                        if (!logData.location) {
                            logData.location = { connect: { id: location.id } };
                        }
                    }
                }
            }

            if (ocpi_connector_id && ocpi_evse_uid && ocpi_location_id && resolvedPartnerId && !connector_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    // Then find EVSE
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: resolvedPartnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        // Then find connector
                        const connector = await databaseService.prisma.eVSEConnector.findFirst({
                            where: {
                                evse_id: evse.id,
                                connector_id: ocpi_connector_id,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (connector) {
                            logData.connector = { connect: { id: connector.id } };
                            // Also set location and evse if not already set
                            if (!logData.location) {
                                logData.location = { connect: { id: location.id } };
                            }
                            if (!logData.evse) {
                                logData.evse = { connect: { id: evse.id } };
                            }
                        }
                    }
                }
            }

            // ocpi_session_id and cpo_session_id are the same - both refer to the CPO's session ID
            const sessionIdToResolve = ocpi_session_id || cpo_session_id;
            if (sessionIdToResolve && resolvedPartnerId && !session_id) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        cpo_session_id: sessionIdToResolve,
                        partner_id: resolvedPartnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.session = { connect: { id: session.id } };
                }
            }

            // Resolve session IDs from authorization_reference if provided
            if (authorization_reference && resolvedPartnerId) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        authorization_reference: authorization_reference,
                        partner_id: resolvedPartnerId,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.authorization_reference_session = { connect: { id: session.id } };
                }
            }

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            // Silently fail - logging errors should not break the request flow
            logger.error('Failed to persist OCPI incoming response log', logError as Error, {
                path: params.req.path,
                method: params.req.method,
            });
        }
    }

    /**
     * Log outgoing request (EMSP → CPO) - called before sending the request
     * Sender type is always EMSP for outgoing requests
     */
    public static async logOutgoingRequest(params: {
        url: string;
        method: string;
        headers: Record<string, string | number | boolean | undefined>;
        requestBody?: any;
        partnerId?: string;
        command?: OCPILogCommand;
        // Internal DB IDs (if already resolved)
        location_id?: string;
        evse_id?: string;
        connector_id?: string;
        session_id?: string;
        // OCPI IDs (will be resolved to internal DB IDs)
        ocpi_location_id?: string;
        ocpi_evse_uid?: string;
        ocpi_connector_id?: string;
        ocpi_session_id?: string;
        authorization_reference?: string;
        cpo_session_id?: string;
    }): Promise<void> {
        try {
            const {
                url,
                method,
                headers,
                requestBody,
                partnerId,
                command,
                location_id,
                evse_id,
                connector_id,
                session_id,
                ocpi_location_id,
                ocpi_evse_uid,
                ocpi_connector_id,
                ocpi_session_id,
                authorization_reference,
                cpo_session_id,
            } = params;

            if (!partnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            if (!command) {
                // Cannot persist log without command; silently skip.
                return;
            }

            const payload = this.toSafeJson({
                method,
                url,
                headers,
                requestBody,
            });

            // Build log data with relations
            const logData: any = {
                command,
                sender_type: 'EMSP', // Always EMSP for outgoing requests
                url,
                payload,
                partner: {
                    connect: { id: partnerId },
                },
            };

            // Connect to IDs if provided (assume they are correct internal DB IDs)
            if (location_id) {
                logData.location = { connect: { id: location_id } };
            }
            if (evse_id) {
                logData.evse = { connect: { id: evse_id } };
            }
            if (connector_id) {
                logData.connector = { connect: { id: connector_id } };
            }
            if (session_id) {
                logData.session = { connect: { id: session_id } };
            }

            // Resolve OCPI IDs to internal DB IDs if provided
            if (ocpi_location_id && partnerId && !location_id) {
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    logData.location = { connect: { id: location.id } };
                }
            }

            if (ocpi_evse_uid && ocpi_location_id && partnerId && !evse_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: partnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        logData.evse = { connect: { id: evse.id } };
                        // Also set location if not already set
                        if (!logData.location) {
                            logData.location = { connect: { id: location.id } };
                        }
                    }
                }
            }

            if (ocpi_connector_id && ocpi_evse_uid && ocpi_location_id && partnerId && !connector_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    // Then find EVSE
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: partnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        // Then find connector
                        const connector = await databaseService.prisma.eVSEConnector.findFirst({
                            where: {
                                evse_id: evse.id,
                                connector_id: ocpi_connector_id,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (connector) {
                            logData.connector = { connect: { id: connector.id } };
                            // Also set location and evse if not already set
                            if (!logData.location) {
                                logData.location = { connect: { id: location.id } };
                            }
                            if (!logData.evse) {
                                logData.evse = { connect: { id: evse.id } };
                            }
                        }
                    }
                }
            }

            // ocpi_session_id and cpo_session_id are the same - both refer to the CPO's session ID
            const sessionIdToResolve = ocpi_session_id || cpo_session_id;
            if (sessionIdToResolve && partnerId && !session_id) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        cpo_session_id: sessionIdToResolve,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.session = { connect: { id: session.id } };
                }
            }

            // Resolve session IDs from authorization_reference if provided
            if (authorization_reference && partnerId) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        authorization_reference: authorization_reference,
                        partner_id: partnerId,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.authorization_reference_session = { connect: { id: session.id } };
                }
            }

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            logger.error('Failed to persist OCPI outgoing request log', logError as Error);
        }
    }

    /**
     * Log outgoing response (CPO → EMSP) - called after receiving the response
     * Sender type is always CPO for outgoing responses (response from CPO)
     */
    public static async logOutgoingResponse(params: {
        url: string;
        method: string;
        headers: Record<string, string | number | boolean | undefined>;
        responseBody?: any;
        statusCode?: number;
        partnerId?: string;
        command?: OCPILogCommand;
        error?: any;
        // Internal DB IDs (if already resolved)
        location_id?: string;
        evse_id?: string;
        connector_id?: string;
        session_id?: string;
        // OCPI IDs (will be resolved to internal DB IDs)
        ocpi_location_id?: string;
        ocpi_evse_uid?: string;
        ocpi_connector_id?: string;
        ocpi_session_id?: string;
        authorization_reference?: string;
        cpo_session_id?: string;
    }): Promise<void> {
        try {
            const {
                url,
                method,
                headers,
                responseBody,
                statusCode,
                partnerId,
                command,
                error,
                location_id,
                evse_id,
                connector_id,
                session_id,
                ocpi_location_id,
                ocpi_evse_uid,
                ocpi_connector_id,
                ocpi_session_id,
                authorization_reference,
                cpo_session_id,
            } = params;

            if (!partnerId) {
                // Cannot persist log without partner; silently skip.
                return;
            }

            if (!command) {
                // Cannot persist log without command; silently skip.
                return;
            }

            const payload = this.toSafeJson({
                method,
                url,
                headers,
                responseBody: responseBody ?? (error ? { error } : undefined),
                statusCode,
                error,
            });

            // Build log data with relations
            const logData: any = {
                command,
                sender_type: 'CPO', // Always CPO for outgoing responses (response from CPO)
                url,
                payload,
                partner: {
                    connect: { id: partnerId },
                },
            };

            // Connect to IDs if provided (assume they are correct internal DB IDs)
            if (location_id) {
                logData.location = { connect: { id: location_id } };
            }
            if (evse_id) {
                logData.evse = { connect: { id: evse_id } };
            }
            if (connector_id) {
                logData.connector = { connect: { id: connector_id } };
            }
            if (session_id) {
                logData.session = { connect: { id: session_id } };
            }

            // Resolve OCPI IDs to internal DB IDs if provided
            if (ocpi_location_id && partnerId && !location_id) {
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    logData.location = { connect: { id: location.id } };
                }
            }

            if (ocpi_evse_uid && ocpi_location_id && partnerId && !evse_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: partnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        logData.evse = { connect: { id: evse.id } };
                        // Also set location if not already set
                        if (!logData.location) {
                            logData.location = { connect: { id: location.id } };
                        }
                    }
                }
            }

            if (ocpi_connector_id && ocpi_evse_uid && ocpi_location_id && partnerId && !connector_id) {
                // First find location
                const location = await databaseService.prisma.location.findFirst({
                    where: {
                        ocpi_location_id: ocpi_location_id,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (location) {
                    // Then find EVSE
                    const evse = await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: location.id,
                            uid: ocpi_evse_uid,
                            partner_id: partnerId,
                            deleted: false,
                        },
                        select: { id: true },
                    });
                    if (evse) {
                        // Then find connector
                        const connector = await databaseService.prisma.eVSEConnector.findFirst({
                            where: {
                                evse_id: evse.id,
                                connector_id: ocpi_connector_id,
                                deleted: false,
                            },
                            select: { id: true },
                        });
                        if (connector) {
                            logData.connector = { connect: { id: connector.id } };
                            // Also set location and evse if not already set
                            if (!logData.location) {
                                logData.location = { connect: { id: location.id } };
                            }
                            if (!logData.evse) {
                                logData.evse = { connect: { id: evse.id } };
                            }
                        }
                    }
                }
            }

            // ocpi_session_id and cpo_session_id are the same - both refer to the CPO's session ID
            const sessionIdToResolve = ocpi_session_id || cpo_session_id;
            if (sessionIdToResolve && partnerId && !session_id) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        cpo_session_id: sessionIdToResolve,
                        partner_id: partnerId,
                        deleted: false,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.session = { connect: { id: session.id } };
                }
            }

            // Resolve session IDs from authorization_reference if provided
            if (authorization_reference && partnerId) {
                const session = await databaseService.prisma.session.findFirst({
                    where: {
                        authorization_reference: authorization_reference,
                        partner_id: partnerId,
                    },
                    select: { id: true },
                });
                if (session) {
                    logData.authorization_reference_session = { connect: { id: session.id } };
                }
            }

            await OCPILogDbService.createLog(logData);
        }
        catch (logError) {
            logger.error('Failed to persist OCPI outgoing response log', logError as Error);
        }
    }
}


