import { Request, Response } from 'express';
import { CDR as PrismaCDR, Prisma, OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICDRResponse, OCPICDRsResponse } from '../../../../schema/modules/cdrs/types/responses';
import { OCPICDR } from '../../../../schema/modules/cdrs/types';
import { databaseService } from '../../../../../services/database.service';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import ChargingService from '../../../../../ubc/actions/services/ChargingService';
import { CDRService } from './CDRService';
import { isEmpty } from 'lodash';
import { logger } from '../../../../../services/logger.service';
import { SessionDbService } from '../../../../../db-services/SessionDbService';
// NOTE: Utils import removed – not used in this module.

/**
 * OCPI 2.2.1 – CDRs module (incoming, EMSP side).
 *
 * CPO → EMSP (Receiver interface):
 * - GET  /cdrs
 * - GET  /cdrs/{cdr_id}
 * - POST /cdrs
 */
export default class OCPIv221CDRsModuleIncomingRequestService {
    /**
     * GET /cdrs
     *
     * Optional OCPI endpoint to list CDRs.
     * Supports date_from/date_to, country_code, party_id, offset, limit.
     */
    public static async handleGetCDRs(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPICDRsResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /cdrs', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /cdrs in handleGetCDRs`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetCdrReq,
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Parsing query parameters in handleGetCDRs`, { 
                data: { ...logData, query: req.query } 
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

            logger.debug(`🟡 [${reqId}] Building query filters in handleGetCDRs`, { 
                data: { ...logData, filters: { country_code, party_id, date_from, date_to } } 
            });
            const where: Prisma.CDRWhereInput = {
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

            logger.debug(`🟡 [${reqId}] Fetching CDRs from database in handleGetCDRs`, { 
                data: { ...logData, skip, take } 
            });
            const cdrs = await prisma.cDR.findMany({
                where,
                orderBy: { last_updated: 'desc' },
                skip,
                take,
            });

            logger.debug(`🟢 [${reqId}] Fetched ${cdrs.length} CDRs from database in handleGetCDRs`, { 
                data: { ...logData, cdrCount: cdrs.length } 
            });

            logger.debug(`🟡 [${reqId}] Mapping Prisma CDRs to OCPI format in handleGetCDRs`, { 
                data: { ...logData, cdrs } 
            });
            const data: OCPICDR[] = cdrs.map(
                OCPIv221CDRsModuleIncomingRequestService.mapPrismaCdrToOcpi,
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
                command: OCPILogCommand.GetCdrRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /cdrs response in handleGetCDRs`, { 
                data: { ...logData, cdrCount: data.length, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetCDRs: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * GET /cdrs/{country_code}/{party_id}/{cdr_id}
     */
    public static async handleGetCDR(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /cdrs/:cdr_id', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /cdrs/:cdr_id in handleGetCDR`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetCdrReq,
            });

            const prisma = databaseService.prisma;
            const { country_code, party_id, cdr_id } = req.params as {
                country_code: string;
                party_id: string;
                cdr_id: string;
            };

            logger.debug(`🟡 [${reqId}] Finding CDR by OCPI ID in handleGetCDR`, { 
                data: { ...logData, country_code, party_id, cdr_id } 
            });
            const cdr = await prisma.cDR.findFirst({
                where: {
                    country_code,
                    party_id,
                    ocpi_cdr_id: cdr_id,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
            });

            if (!cdr) {
                logger.warn(`🟡 [${reqId}] CDR not found in handleGetCDR`, { 
                    data: { ...logData, country_code, party_id, cdr_id } 
                });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'CDR not found',
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
                    command: OCPILogCommand.GetCdrsRes,
                });

                logger.debug(`🟢 [${reqId}] Returning 404 response in handleGetCDR`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma CDR to OCPI format in handleGetCDR`, { 
                data: { ...logData, cdr } 
            });
            const data = OCPIv221CDRsModuleIncomingRequestService.mapPrismaCdrToOcpi(cdr);

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
                command: OCPILogCommand.GetCdrRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /cdrs/:cdr_id response in handleGetCDR`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetCDR: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * POST /cdrs/{country_code}/{party_id}
     *
     * CPO pushes a new CDR.
     */
    public static async handlePostCDR(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        console.log("cpo partner credentials:", partnerCredentials);
        const logData = { action: 'POST /cdrs', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting POST /cdrs in handlePostCDR`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostCdrReq,
            });

            const prisma = databaseService.prisma;
            const payload = req.body as OCPICDR;

            logger.debug(`🟡 [${reqId}] Parsing POST CDR payload in handlePostCDR`, { 
                data: { ...logData, payload } 
            });

            if (!payload) {
                logger.warn(`🟡 [${reqId}] CDR payload is missing in handlePostCDR`, { data: logData });
                const response = {
                    httpStatus: 400,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2000,
                        status_message: 'CDR payload is required',
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
                    command: OCPILogCommand.PostCdrRes,
                });

                logger.debug(`🟢 [${reqId}] Returning 400 response in handlePostCDR`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            const partnerId = partnerCredentials.partner_id;

            logger.debug(`🟡 [${reqId}] Checking for existing CDR in handlePostCDR`, { 
                data: { ...logData, cdrId: payload.id, country_code: payload.country_code, party_id: payload.party_id } 
            });

            console.log("Checking existing with:", {
            country_code: payload.country_code,
            party_id: payload.party_id,
            ocpi_cdr_id: payload.id,
            partner_id: partnerId,
            });
            // Upsert by (country_code, party_id, id)
            const existing = await prisma.cDR.findFirst({
                where: {
                    country_code: payload.country_code,
                    party_id: payload.party_id,
                    ocpi_cdr_id: payload.id,
                    deleted: false,
                    partner_id: partnerId,
                },
            });

            console.log("Existing result:", existing);

            let stored: PrismaCDR;
            if (!existing) {
                logger.debug(`🟡 [${reqId}] Creating new CDR in handlePostCDR`, { data: logData });
                // Create CDR if it doesn't exist - only include fields present in payload
                const cdrCreateFields = CDRService.buildCdrCreateFields(payload, partnerId);
                stored = await prisma.cDR.create({
                    data: cdrCreateFields,
                });
                logger.debug(`🟢 [${reqId}] Created new CDR in handlePostCDR`, { 
                    data: { ...logData, cdrId: stored.id } 
                });
            }
            else {
                logger.debug(`🟡 [${reqId}] Updating existing CDR in handlePostCDR`, { 
                    data: { ...logData, existingCdrId: existing.id } 
                });
                // Update existing CDR - only include fields present in payload that have changed
                const cdrUpdateFields = CDRService.buildCdrUpdateFields(payload, existing);
                // Only update if there are changes
                if (!isEmpty(cdrUpdateFields)) {
                    stored = await prisma.cDR.update({
                        where: { id: existing.id },
                        data: cdrUpdateFields,
                    });
                    logger.debug(`🟢 [${reqId}] Updated existing CDR in handlePostCDR`, { 
                        data: { ...logData, cdrId: stored.id } 
                    });
                }
                else {
                    stored = existing;
                    logger.debug(`🟢 [${reqId}] No changes to CDR, using existing in handlePostCDR`, { 
                        data: { ...logData, cdrId: stored.id } 
                    });
                }
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma CDR to OCPI format in handlePostCDR`, { 
                data: { ...logData, cdr: stored } 
            });
            const data = OCPIv221CDRsModuleIncomingRequestService.mapPrismaCdrToOcpi(stored);

            const response = {
                httpStatus: 200,
                payload: {
                    data,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            // Pass OCPI IDs (authorization_reference, cpo_session_id) - logging function will resolve them to internal DB IDs
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostCdrRes,
                authorization_reference: stored.authorization_reference || undefined,
                cpo_session_id: stored.session_id || undefined,
            });

            logger.debug(`🟡 [${reqId}] Calling ChargingService.handleActionOnChargingCompleted in handlePostCDR`, { 
                data: { ...logData, session_id: stored?.session_id, cdrId: stored?.id } 
            });
            // Pass session_id (cpo_session_id) to handleActionOnChargingCompleted - it will fetch session and payment txn
            // Don't await - this is async and shouldn't block CDR response
            // Check session's additional_props.on_update_stop_charging_sent to determine if on_update should be sent
            if (stored?.session_id && stored?.authorization_reference) {
                const session = await SessionDbService.getByAuthorizationReference(stored.authorization_reference);
                const additionalProps = (session?.additional_props as Record<string, unknown>) || {};
                const onUpdateStopChargingSent = additionalProps.on_update_stop_charging_sent === true;

                if (!onUpdateStopChargingSent) {
                    ChargingService.handleActionOnChargingCompleted(stored.session_id)
                        .catch((e: any) => {
                            logger.error(`🔴 [${reqId}] Error in handleActionOnChargingCompleted: ${e?.toString()}`, e, {
                                data: { ...logData, session_id: stored.session_id },
                            });
                        });
                } else {
                    logger.debug(`🟡 [${reqId}] on_update_stop_charging already sent, skipping handleActionOnChargingCompleted`, {
                        data: { ...logData, cdrId: stored?.id }
                    });
                }
            }
            else {
                logger.warn(`🟡 [${reqId}] session_id or authorization_reference not found in CDR, skipping handleActionOnChargingCompleted`, {
                    data: { ...logData, cdrId: stored?.id }
                });
            }

            logger.debug(`🟢 [${reqId}] Returning POST /cdrs response in handlePostCDR`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePostCDR: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    private static mapPrismaCdrToOcpi(cdr: PrismaCDR): OCPICDR {
        return {
            country_code: cdr.country_code,
            party_id: cdr.party_id,
            id: cdr.ocpi_cdr_id,
            start_date_time: cdr.start_date_time.toISOString(),
            end_date_time: cdr.end_date_time.toISOString(),
            session_id: cdr.session_id ?? undefined,
            cdr_token: cdr.cdr_token as unknown as OCPICDR['cdr_token'],
            auth_method: cdr.auth_method as OCPICDR['auth_method'],
            authorization_reference: cdr.authorization_reference ?? undefined,
            cdr_location: cdr.cdr_location as unknown as OCPICDR['cdr_location'],
            meter_id: cdr.meter_id ?? undefined,
            currency: cdr.currency,
            tariffs: (cdr.tariffs as unknown as OCPICDR['tariffs']) || undefined,
            charging_periods:
                cdr.charging_periods as unknown as OCPICDR['charging_periods'],
            signed_data: (cdr.signed_data as unknown as OCPICDR['signed_data']) || undefined,
            total_cost: cdr.total_cost as unknown as OCPICDR['total_cost'],
            total_fixed_cost:
                (cdr.total_fixed_cost as unknown as OCPICDR['total_fixed_cost']) || undefined,
            total_energy: Number(cdr.total_energy),
            total_energy_cost:
                (cdr.total_energy_cost as unknown as OCPICDR['total_energy_cost']) || undefined,
            total_time: Number(cdr.total_time),
            total_time_cost:
                (cdr.total_time_cost as unknown as OCPICDR['total_time_cost']) || undefined,
            total_parking_time: cdr.total_parking_time
                ? Number(cdr.total_parking_time)
                : undefined,
            total_parking_cost:
                (cdr.total_parking_cost as unknown as OCPICDR['total_parking_cost']) || undefined,
            total_reservation_cost:
                (cdr.total_reservation_cost as unknown as OCPICDR['total_reservation_cost']) ||
                undefined,
            remark: cdr.remark ?? undefined,
            invoice_reference_id: cdr.invoice_reference_id ?? undefined,
            credit: cdr.credit ?? undefined,
            credit_reference_id: cdr.credit_reference_id ?? undefined,
            home_charging_compensation: undefined,
            last_updated: cdr.last_updated.toISOString(),
            remarks: cdr.remarks ?? undefined,
        };
    }

    private static mapOcpiCdrToPrisma(
        cdr: OCPICDR,
        partnerId: string,
    ): Prisma.CDRUncheckedCreateInput {
        return {
            country_code: cdr.country_code,
            party_id: cdr.party_id,
            ocpi_cdr_id: cdr.id,
            start_date_time: new Date(cdr.start_date_time),
            end_date_time: new Date(cdr.end_date_time),
            session_id: cdr.session_id ?? null,
            cdr_token: cdr.cdr_token as unknown as Prisma.InputJsonValue,
            auth_method: String(cdr.auth_method),
            authorization_reference: cdr.authorization_reference ?? null,
            cdr_location: cdr.cdr_location as unknown as Prisma.InputJsonValue,
            meter_id: cdr.meter_id ?? null,
            currency: cdr.currency,
            tariffs: cdr.tariffs
                ? (cdr.tariffs as unknown as Prisma.InputJsonValue)
                : undefined,
            charging_periods: cdr.charging_periods as unknown as Prisma.InputJsonValue,
            signed_data: cdr.signed_data
                ? (cdr.signed_data as unknown as Prisma.InputJsonValue)
                : undefined,
            total_cost: cdr.total_cost as unknown as Prisma.InputJsonValue,
            total_fixed_cost: cdr.total_fixed_cost
                ? (cdr.total_fixed_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_energy: new Prisma.Decimal(cdr.total_energy),
            total_energy_cost: cdr.total_energy_cost
                ? (cdr.total_energy_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            // OCPI provides total_time in hours (decimal). We store it as seconds in BigInt.
            total_time: BigInt(Math.round(Number(cdr.total_time ?? 0) * 3600)),
            total_time_cost: cdr.total_time_cost
                ? (cdr.total_time_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_parking_time: cdr.total_parking_time != null
                // OCPI provides total_parking_time in hours (decimal). We store it as seconds in BigInt.
                ? BigInt(Math.round(Number(cdr.total_parking_time) * 3600))
                : undefined,
            total_parking_cost: cdr.total_parking_cost
                ? (cdr.total_parking_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_reservation_cost: cdr.total_reservation_cost
                ? (cdr.total_reservation_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            remark: cdr.remark ?? null,
            invoice_reference_id: cdr.invoice_reference_id ?? null,
            credit: cdr.credit ?? null,
            credit_reference_id: cdr.credit_reference_id ?? null,
            remarks: cdr.remarks ?? null,
            last_updated: new Date(cdr.last_updated ?? new Date().toISOString()),
            deleted: false,
            deleted_at: null,
            created_at: undefined,
            updated_at: undefined,
            partner_id: partnerId,
            id: undefined,
        };
    }
}
