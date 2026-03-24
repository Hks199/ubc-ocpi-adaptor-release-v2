import { Prisma, Session } from '@prisma/client';
import {
    OCPISession,
    OCPIPatchSession,
} from '../../../../schema/modules/sessions/types';
import { isEqual } from 'lodash';
import { logger } from '../../../../../services/logger.service';

/**
 * Service for building create and update fields from OCPI session payloads
 * Only includes fields that are present in the payload
 */
export class SessionService {
    /**
     * Build session create fields from OCPI payload - only includes fields present in payload
     */
    public static buildSessionCreateFields(
        payload: OCPISession,
        partnerId: string,
    ): Prisma.SessionUncheckedCreateInput {
        const reqId = 'internal';
        const logData = { action: 'buildSessionCreateFields', partnerId, sessionId: payload.id };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildSessionCreateFields in SessionService`, { data: logData });

            const sessionCreateFields: Prisma.SessionUncheckedCreateInput = {
            partner_id: partnerId,
            deleted: false,
            deleted_at: null,
        };

        if (payload.country_code !== undefined) sessionCreateFields.country_code = payload.country_code;
        if (payload.party_id !== undefined) sessionCreateFields.party_id = payload.party_id;
        if (payload.id !== undefined) sessionCreateFields.cpo_session_id = payload.id;
        if (payload.start_date_time !== undefined) sessionCreateFields.start_date_time = payload.start_date_time ? new Date(payload.start_date_time) : null;
        if (payload.end_date_time !== undefined) sessionCreateFields.end_date_time = payload.end_date_time ? new Date(payload.end_date_time) : null;
        if (payload.kwh !== undefined) sessionCreateFields.kwh = new Prisma.Decimal(payload.kwh);
        if (payload.cdr_token !== undefined) sessionCreateFields.cdr_token = payload.cdr_token as Prisma.InputJsonValue;
        if (payload.auth_method !== undefined) sessionCreateFields.auth_method = String(payload.auth_method);
        if (payload.authorization_reference !== undefined) sessionCreateFields.authorization_reference = payload.authorization_reference ?? null;
        if (payload.location_id !== undefined) sessionCreateFields.location_id = payload.location_id ?? null;
        if (payload.evse_uid !== undefined) sessionCreateFields.evse_uid = payload.evse_uid ?? null;
        if (payload.connector_id !== undefined) sessionCreateFields.connector_id = payload.connector_id ?? null;
        if (payload.meter_id !== undefined) sessionCreateFields.meter_id = payload.meter_id ?? null;
        if (payload.currency !== undefined) sessionCreateFields.currency = payload.currency ?? null;
        if (payload.charging_periods !== undefined) sessionCreateFields.charging_periods = payload.charging_periods as Prisma.InputJsonValue;
        if (payload.total_cost !== undefined) sessionCreateFields.total_cost = payload.total_cost as Prisma.InputJsonValue;
        if (payload.status !== undefined) sessionCreateFields.status = String(payload.status);
        if (payload.last_updated !== undefined) sessionCreateFields.last_updated = new Date(payload.last_updated ?? new Date().toISOString());

            logger.debug(`🟢 [${reqId}] Completed buildSessionCreateFields in SessionService`, { 
                data: { ...logData, fieldCount: Object.keys(sessionCreateFields).length } 
            });

            return sessionCreateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildSessionCreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build session update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildSessionUpdateFields(
        payload: OCPISession | OCPIPatchSession,
        existing?: Session | null,
    ): Prisma.SessionUncheckedUpdateInput {
        const reqId = 'internal';
        const logData = { action: 'buildSessionUpdateFields', sessionId: payload.id, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildSessionUpdateFields in SessionService`, { data: logData });

            const sessionUpdateFields: Prisma.SessionUncheckedUpdateInput = {};

        if (payload.country_code !== undefined && (!existing || existing.country_code !== payload.country_code)) {
            sessionUpdateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined && (!existing || existing.party_id !== payload.party_id)) {
            sessionUpdateFields.party_id = payload.party_id;
        }
        if (payload.id !== undefined && (!existing || existing.cpo_session_id !== payload.id)) {
            sessionUpdateFields.cpo_session_id = payload.id;
        }
        if (payload.start_date_time !== undefined) {
            const payloadStartDate = payload.start_date_time ? new Date(payload.start_date_time) : null;
            const existingStartDate = existing?.start_date_time ?? null;
            if (!existing || existingStartDate?.getTime() !== payloadStartDate?.getTime()) {
                sessionUpdateFields.start_date_time = payloadStartDate;
            }
        }
        if (payload.end_date_time !== undefined) {
            const payloadEndDate = payload.end_date_time ? new Date(payload.end_date_time) : null;
            const existingEndDate = existing?.end_date_time ?? null;
            if (!existing || existingEndDate?.getTime() !== payloadEndDate?.getTime()) {
                sessionUpdateFields.end_date_time = payloadEndDate;
            }
        }
        if (payload.kwh !== undefined) {
            const payloadKwh = new Prisma.Decimal(payload.kwh);
            if (!existing || !existing.kwh || !existing.kwh.equals(payloadKwh)) {
                sessionUpdateFields.kwh = payloadKwh;
            }
        }
        if (payload.cdr_token !== undefined && (!existing || !isEqual(existing.cdr_token, payload.cdr_token))) {
            sessionUpdateFields.cdr_token = payload.cdr_token as Prisma.InputJsonValue;
        }
        if (payload.auth_method !== undefined && (!existing || existing.auth_method !== String(payload.auth_method))) {
            sessionUpdateFields.auth_method = String(payload.auth_method);
        }
        if (payload.authorization_reference !== undefined && (!existing || existing.authorization_reference !== payload.authorization_reference)) {
            sessionUpdateFields.authorization_reference = payload.authorization_reference ?? null;
        }
        if (payload.location_id !== undefined && (!existing || existing.location_id !== payload.location_id)) {
            sessionUpdateFields.location_id = payload.location_id ?? null;
        }
        if (payload.evse_uid !== undefined && (!existing || existing.evse_uid !== payload.evse_uid)) {
            sessionUpdateFields.evse_uid = payload.evse_uid ?? null;
        }
        if (payload.connector_id !== undefined && (!existing || existing.connector_id !== payload.connector_id)) {
            sessionUpdateFields.connector_id = payload.connector_id ?? null;
        }
        if (payload.meter_id !== undefined && (!existing || existing.meter_id !== payload.meter_id)) {
            sessionUpdateFields.meter_id = payload.meter_id ?? null;
        }
        if (payload.currency !== undefined && (!existing || existing.currency !== payload.currency)) {
            sessionUpdateFields.currency = payload.currency ?? null;
        }
        if (payload.charging_periods !== undefined && (!existing || !isEqual(existing.charging_periods, payload.charging_periods))) {
            sessionUpdateFields.charging_periods = payload.charging_periods as Prisma.InputJsonValue;
        }
        if (payload.total_cost !== undefined && (!existing || !isEqual(existing.total_cost, payload.total_cost))) {
            sessionUpdateFields.total_cost = payload.total_cost as Prisma.InputJsonValue;
        }
        if (payload.status !== undefined && (!existing || existing.status !== String(payload.status))) {
            sessionUpdateFields.status = String(payload.status);
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated);
            if (!existing || existing.last_updated?.getTime() !== payloadLastUpdated.getTime()) {
                sessionUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildSessionUpdateFields in SessionService`, { 
                data: { ...logData, fieldCount: Object.keys(sessionUpdateFields).length } 
            });

            return sessionUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildSessionUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}

