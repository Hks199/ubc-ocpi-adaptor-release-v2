import { Request } from "express";
import { HttpResponse } from "../../types/responses";
import { AdminResponsePayload } from "../types/responses";
import { ValidationError } from "../../utils/errors";
import { generateToken, extractTokenFromHeader, verifyToken } from "../../utils/auth";
import { logger } from "../../services/logger.service";

export default class AdminAuthModule {
    public static async login(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'login' };

        try {
            logger.debug(`🟡 [${reqId}] Starting login in AdminAuthModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in login`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const { email, company } = req.body;

            if (!email) {
                logger.warn(`🟡 [${reqId}] Email missing in login`, { data: logData });
                throw new ValidationError('Email is required');
            }

            // In a real implementation, validate credentials against a user database
            // For now, accept any email with company domain validation
            logger.debug(`🟡 [${reqId}] Generating token in login`, { 
                data: { ...logData, email } 
            });
            const token = generateToken({ email, company });

            logger.info(`🟢 [${reqId}] Admin login successful`, { 
                email,
                data: { ...logData, email, company } 
            });

            logger.debug(`🟢 [${reqId}] Returning login response`, { 
                data: { ...logData, email } 
            });

            return {
                payload: {
                    data: {
                        token,
                        user: { email, company },
                    },
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in login: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    public static async getMe(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'getMe' };

        try {
            logger.debug(`🟡 [${reqId}] Starting getMe in AdminAuthModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Extracting and verifying token in getMe`, { data: logData });
            const token = extractTokenFromHeader(req.headers.authorization);
            const payload = verifyToken(token);

            logger.debug(`🟢 [${reqId}] Token verified in getMe`, { 
                data: { ...logData, email: payload.email } 
            });

            logger.debug(`🟢 [${reqId}] Returning getMe response`, { 
                data: { ...logData, email: payload.email } 
            });

            return {
                payload: {
                    data: {
                        email: payload.email,
                        company: payload.company,
                    },
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getMe: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}

