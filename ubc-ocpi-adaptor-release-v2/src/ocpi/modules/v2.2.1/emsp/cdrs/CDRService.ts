import { Prisma, CDR } from '@prisma/client';
import {
    OCPICDR,
} from '../../../../schema/modules/cdrs/types';
import { isEqual } from 'lodash';
import { logger } from '../../../../../services/logger.service';

/**
 * Service for building create and update fields from OCPI CDR payloads
 * Only includes fields that are present in the payload
 */
export class CDRService {
    /**
     * Normalize a date string by removing spaces around colons in the time portion
     * Handles malformed ISO 8601 dates like "2026-01-07T09: 46: 58Z" -> "2026-01-07T09:46:58Z"
     */
    private static normalizeDateString(dateString: string): string {
        // Remove spaces around colons in the time portion (e.g., "09: 46: 58" -> "09:46:58")
        // This handles malformed ISO 8601 dates that have spaces
        return dateString.replace(/\s*:\s*/g, ':').trim();
    }

    /**
     * Validate and parse a date string to a Date object
     * Throws an error if the date string is invalid
     */
    private static validateAndParseDate(
        dateString: string | null | undefined,
        fieldName: string,
        reqId: string,
    ): Date {
        if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
            const errorMsg = `Invalid ${fieldName}: value is missing, null, or empty string`;
            logger.error(`🔴 [${reqId}] ${errorMsg}`, undefined, { 
                data: { fieldName, value: dateString } 
            });
            throw new Error(errorMsg);
        }

        // Normalize the date string to handle malformed ISO 8601 dates
        const normalizedDateString = this.normalizeDateString(dateString);
        const date = new Date(normalizedDateString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            const errorMsg = `Invalid ${fieldName}: "${dateString}" (normalized: "${normalizedDateString}") cannot be parsed as a valid date`;
            logger.error(`🔴 [${reqId}] ${errorMsg}`, undefined, { 
                data: { 
                    fieldName, 
                    originalValue: dateString, 
                    normalizedValue: normalizedDateString,
                    type: typeof dateString 
                } 
            });
            throw new Error(errorMsg);
        }

        // Log if normalization was needed (for debugging)
        if (dateString !== normalizedDateString) {
            logger.debug(`🟡 [${reqId}] Normalized ${fieldName} from "${dateString}" to "${normalizedDateString}"`, {
                data: { fieldName, original: dateString, normalized: normalizedDateString }
            });
        }

        return date;
    }

    /**
     * Safely parse a date string to a Date object
     * Returns null if the date string is invalid (does not throw)
     */
    private static safeParseDate(
        dateString: string | null | undefined,
        fieldName: string,
        reqId: string,
    ): Date | null {
        if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
            logger.warn(`🟡 [${reqId}] ${fieldName} is missing, null, or empty string, will use fallback`, { 
                data: { fieldName, value: dateString } 
            });
            return null;
        }

        // Normalize the date string to handle malformed ISO 8601 dates
        const normalizedDateString = this.normalizeDateString(dateString);
        const date = new Date(normalizedDateString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            logger.warn(`🟡 [${reqId}] Invalid ${fieldName}: "${dateString}" (normalized: "${normalizedDateString}") cannot be parsed, will use fallback`, { 
                data: { 
                    fieldName, 
                    originalValue: dateString, 
                    normalizedValue: normalizedDateString,
                    type: typeof dateString 
                } 
            });
            return null;
        }

        // Log if normalization was needed (for debugging)
        if (dateString !== normalizedDateString) {
            logger.debug(`🟡 [${reqId}] Normalized ${fieldName} from "${dateString}" to "${normalizedDateString}"`, {
                data: { fieldName, original: dateString, normalized: normalizedDateString }
            });
        }

        return date;
    }

    /**
     * Validate and parse a number to Prisma Decimal
     */
    private static validateAndParseDecimal(
        value: number | string | null | undefined,
        fieldName: string,
        reqId: string,
    ): Prisma.Decimal {
        if (value === null || value === undefined) {
            const errorMsg = `Invalid ${fieldName}: value is null or undefined`;
            logger.error(`🔴 [${reqId}] ${errorMsg}`, undefined, { 
                data: { fieldName, value } 
            });
            throw new Error(errorMsg);
        }

        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        
        if (isNaN(numValue) || !isFinite(numValue)) {
            const errorMsg = `Invalid ${fieldName}: "${value}" cannot be parsed as a valid number`;
            logger.error(`🔴 [${reqId}] ${errorMsg}`, undefined, { 
                data: { fieldName, value, type: typeof value } 
            });
            throw new Error(errorMsg);
        }

        return new Prisma.Decimal(numValue);
    }

    /**
     * Build CDR create fields from OCPI payload - only includes fields present in payload
     */
    public static buildCdrCreateFields(
        payload: OCPICDR,
        partnerId: string,
    ): Prisma.CDRUncheckedCreateInput {
        const reqId = 'internal';
        const logData = { action: 'buildCdrCreateFields', partnerId, cdrId: payload.id };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildCdrCreateFields in CDRService`, { 
                data: { 
                    ...logData, 
                    start_date_time: payload.start_date_time,
                    end_date_time: payload.end_date_time,
                    total_energy: payload.total_energy,
                } 
            });

            const cdrCreateFields: Partial<Prisma.CDRUncheckedCreateInput> = {
                partner_id: partnerId,
                deleted: false,
                deleted_at: null,
            };

        if (payload.country_code !== undefined) {
            if (typeof payload.country_code !== 'string' || payload.country_code.trim() === '') {
                throw new Error(`Invalid country_code: "${payload.country_code}" must be a non-empty string`);
            }
            cdrCreateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined) {
            if (typeof payload.party_id !== 'string' || payload.party_id.trim() === '') {
                throw new Error(`Invalid party_id: "${payload.party_id}" must be a non-empty string`);
            }
            cdrCreateFields.party_id = payload.party_id;
        }
        if (payload.id !== undefined) {
            if (typeof payload.id !== 'string' || payload.id.trim() === '') {
                throw new Error(`Invalid id: "${payload.id}" must be a non-empty string`);
            }
            cdrCreateFields.ocpi_cdr_id = payload.id;
        }
        if (payload.start_date_time !== undefined) {
            cdrCreateFields.start_date_time = this.validateAndParseDate(
                payload.start_date_time,
                'start_date_time',
                reqId
            );
        }
        // Handle end_date_time: use current time if missing or invalid
        if (payload.end_date_time !== undefined) {
            const parsedEndDate = this.safeParseDate(
                payload.end_date_time,
                'end_date_time',
                reqId
            );
            // Use current time as fallback if end_date_time is invalid
            cdrCreateFields.end_date_time = parsedEndDate || new Date();
            if (!parsedEndDate) {
                logger.debug(`🟡 [${reqId}] Using current time as fallback for invalid end_date_time`, {
                    data: { ...logData, originalValue: payload.end_date_time, fallbackEndDate: cdrCreateFields.end_date_time }
                });
            }
        }
        else {
            // If end_date_time is not present in payload, use current time
            cdrCreateFields.end_date_time = new Date();
            logger.debug(`🟡 [${reqId}] Using current time as fallback for missing end_date_time`, {
                data: { ...logData, fallbackEndDate: cdrCreateFields.end_date_time }
            });
        }
        if (payload.session_id !== undefined) cdrCreateFields.session_id = payload.session_id ?? null;
        if (payload.cdr_token !== undefined) cdrCreateFields.cdr_token = payload.cdr_token as Prisma.InputJsonValue;
        if (payload.auth_method !== undefined) cdrCreateFields.auth_method = String(payload.auth_method);
        if (payload.authorization_reference !== undefined) cdrCreateFields.authorization_reference = payload.authorization_reference ?? null;
        if (payload.cdr_location !== undefined) cdrCreateFields.cdr_location = payload.cdr_location as Prisma.InputJsonValue;
        if (payload.meter_id !== undefined) cdrCreateFields.meter_id = payload.meter_id ?? null;
        if (payload.currency !== undefined) cdrCreateFields.currency = payload.currency;
        if (payload.tariffs !== undefined) cdrCreateFields.tariffs = payload.tariffs ? (payload.tariffs as unknown as Prisma.InputJsonValue) : undefined;
        if (payload.charging_periods !== undefined) cdrCreateFields.charging_periods = payload.charging_periods as Prisma.InputJsonValue;
        if (payload.signed_data !== undefined) cdrCreateFields.signed_data = payload.signed_data ? (payload.signed_data as unknown as Prisma.InputJsonValue) : undefined;
        if (payload.total_cost !== undefined) cdrCreateFields.total_cost = payload.total_cost as Prisma.InputJsonValue;
        if (payload.total_fixed_cost !== undefined) cdrCreateFields.total_fixed_cost = payload.total_fixed_cost ? (payload.total_fixed_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_energy !== undefined) {
            cdrCreateFields.total_energy = this.validateAndParseDecimal(
                payload.total_energy,
                'total_energy',
                reqId
            );
        }
        if (payload.total_energy_cost !== undefined) cdrCreateFields.total_energy_cost = payload.total_energy_cost ? (payload.total_energy_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_time !== undefined) {
            // OCPI provides total_time in hours (decimal). We store it as seconds in BigInt.
            const numValue = typeof payload.total_time === 'string' ? parseFloat(payload.total_time) : payload.total_time;
            if (isNaN(numValue) || !isFinite(numValue) || numValue < 0) {
                throw new Error(`Invalid total_time: "${payload.total_time}" must be a valid non-negative number`);
            }
            cdrCreateFields.total_time = BigInt(Math.round(numValue * 3600));
        }
        if (payload.total_time_cost !== undefined) cdrCreateFields.total_time_cost = payload.total_time_cost ? (payload.total_time_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_parking_time !== undefined) {
            // OCPI provides total_parking_time in hours (decimal). We store it as seconds in BigInt.
            if (payload.total_parking_time != null) {
                const numValue = typeof payload.total_parking_time === 'string' 
                    ? parseFloat(payload.total_parking_time) 
                    : payload.total_parking_time;
                if (isNaN(numValue) || !isFinite(numValue) || numValue < 0) {
                    throw new Error(`Invalid total_parking_time: "${payload.total_parking_time}" must be a valid non-negative number`);
                }
                cdrCreateFields.total_parking_time = BigInt(Math.round(numValue * 3600));
            }
        }
        if (payload.total_parking_cost !== undefined) cdrCreateFields.total_parking_cost = payload.total_parking_cost ? (payload.total_parking_cost as Prisma.InputJsonValue) : undefined;
        if (payload.total_reservation_cost !== undefined) cdrCreateFields.total_reservation_cost = payload.total_reservation_cost ? (payload.total_reservation_cost as Prisma.InputJsonValue) : undefined;
        if (payload.remark !== undefined) cdrCreateFields.remark = payload.remark ?? null;
        if (payload.invoice_reference_id !== undefined) cdrCreateFields.invoice_reference_id = payload.invoice_reference_id ?? null;
        if (payload.credit !== undefined) cdrCreateFields.credit = payload.credit ?? null;
        if (payload.credit_reference_id !== undefined) cdrCreateFields.credit_reference_id = payload.credit_reference_id ?? null;
        if (payload.remarks !== undefined) cdrCreateFields.remarks = payload.remarks ?? null;
        if (payload.last_updated !== undefined) {
            const lastUpdated = payload.last_updated ?? new Date().toISOString();
            cdrCreateFields.last_updated = this.validateAndParseDate(
                lastUpdated,
                'last_updated',
                reqId
            );
        }

            logger.debug(`🟢 [${reqId}] Completed buildCdrCreateFields in CDRService`, { 
                data: { ...logData, fieldCount: Object.keys(cdrCreateFields).length } 
            });

            return cdrCreateFields as Prisma.CDRUncheckedCreateInput;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildCdrCreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build CDR update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildCdrUpdateFields(
        payload: OCPICDR,
        existing?: CDR | null,
    ): Prisma.CDRUncheckedUpdateInput {
        const reqId = 'internal';
        const logData = { action: 'buildCdrUpdateFields', cdrId: payload.id, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildCdrUpdateFields in CDRService`, { data: logData });

            const cdrUpdateFields: Prisma.CDRUncheckedUpdateInput = {};

        if (payload.country_code !== undefined && (!existing || existing.country_code !== payload.country_code)) {
            cdrUpdateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined && (!existing || existing.party_id !== payload.party_id)) {
            cdrUpdateFields.party_id = payload.party_id;
        }
        if (payload.id !== undefined && (!existing || existing.ocpi_cdr_id !== payload.id)) {
            cdrUpdateFields.ocpi_cdr_id = payload.id;
        }
        if (payload.start_date_time !== undefined) {
            const payloadStartDate = this.validateAndParseDate(
                payload.start_date_time,
                'start_date_time',
                reqId
            );
            if (!existing || existing.start_date_time.getTime() !== payloadStartDate.getTime()) {
                cdrUpdateFields.start_date_time = payloadStartDate;
            }
        }
        if (payload.end_date_time !== undefined) {
            const payloadEndDate = this.validateAndParseDate(
                payload.end_date_time,
                'end_date_time',
                reqId
            );
            if (!existing || existing.end_date_time.getTime() !== payloadEndDate.getTime()) {
                cdrUpdateFields.end_date_time = payloadEndDate;
            }
        }
        if (payload.session_id !== undefined && (!existing || existing.session_id !== payload.session_id)) {
            cdrUpdateFields.session_id = payload.session_id ?? null;
        }
        if (payload.cdr_token !== undefined && (!existing || !isEqual(existing.cdr_token, payload.cdr_token))) {
            cdrUpdateFields.cdr_token = payload.cdr_token as Prisma.InputJsonValue;
        }
        if (payload.auth_method !== undefined && (!existing || existing.auth_method !== String(payload.auth_method))) {
            cdrUpdateFields.auth_method = String(payload.auth_method);
        }
        if (payload.authorization_reference !== undefined && (!existing || existing.authorization_reference !== payload.authorization_reference)) {
            cdrUpdateFields.authorization_reference = payload.authorization_reference ?? null;
        }
        if (payload.cdr_location !== undefined && (!existing || !isEqual(existing.cdr_location, payload.cdr_location))) {
            cdrUpdateFields.cdr_location = payload.cdr_location as Prisma.InputJsonValue;
        }
        if (payload.meter_id !== undefined && (!existing || existing.meter_id !== payload.meter_id)) {
            cdrUpdateFields.meter_id = payload.meter_id ?? null;
        }
        if (payload.currency !== undefined && (!existing || existing.currency !== payload.currency)) {
            cdrUpdateFields.currency = payload.currency;
        }
        if (payload.tariffs !== undefined && (!existing || !isEqual(existing.tariffs, payload.tariffs))) {
            cdrUpdateFields.tariffs = payload.tariffs ? (payload.tariffs as unknown as Prisma.InputJsonValue) : undefined;
        }
        if (payload.charging_periods !== undefined && (!existing || !isEqual(existing.charging_periods, payload.charging_periods))) {
            cdrUpdateFields.charging_periods = payload.charging_periods as Prisma.InputJsonValue;
        }
        if (payload.signed_data !== undefined && (!existing || !isEqual(existing.signed_data, payload.signed_data))) {
            cdrUpdateFields.signed_data = payload.signed_data ? (payload.signed_data as unknown as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_cost !== undefined && (!existing || !isEqual(existing.total_cost, payload.total_cost))) {
            cdrUpdateFields.total_cost = payload.total_cost as Prisma.InputJsonValue;
        }
        if (payload.total_fixed_cost !== undefined && (!existing || !isEqual(existing.total_fixed_cost, payload.total_fixed_cost))) {
            cdrUpdateFields.total_fixed_cost = payload.total_fixed_cost ? (payload.total_fixed_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_energy !== undefined) {
            const payloadTotalEnergy = this.validateAndParseDecimal(
                payload.total_energy,
                'total_energy',
                reqId
            );
            if (!existing || !existing.total_energy.equals(payloadTotalEnergy)) {
                cdrUpdateFields.total_energy = payloadTotalEnergy;
            }
        }
        if (payload.total_energy_cost !== undefined && (!existing || !isEqual(existing.total_energy_cost, payload.total_energy_cost))) {
            cdrUpdateFields.total_energy_cost = payload.total_energy_cost ? (payload.total_energy_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_time !== undefined) {
            // OCPI provides total_time in hours (decimal). We store it as seconds in BigInt.
            const numValue = typeof payload.total_time === 'string' ? parseFloat(payload.total_time) : payload.total_time;
            if (isNaN(numValue) || !isFinite(numValue) || numValue < 0) {
                throw new Error(`Invalid total_time: "${payload.total_time}" must be a valid non-negative number`);
            }
            const payloadTotalTime = BigInt(Math.round(numValue * 3600));
            if (!existing || existing.total_time !== payloadTotalTime) {
                cdrUpdateFields.total_time = payloadTotalTime;
            }
        }
        if (payload.total_time_cost !== undefined && (!existing || !isEqual(existing.total_time_cost, payload.total_time_cost))) {
            cdrUpdateFields.total_time_cost = payload.total_time_cost ? (payload.total_time_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_parking_time !== undefined) {
            // OCPI provides total_parking_time in hours (decimal). We store it as seconds in BigInt.
            let payloadTotalParkingTime: bigint | undefined = undefined;
            if (payload.total_parking_time != null) {
                const numValue = typeof payload.total_parking_time === 'string' 
                    ? parseFloat(payload.total_parking_time) 
                    : payload.total_parking_time;
                if (isNaN(numValue) || !isFinite(numValue) || numValue < 0) {
                    throw new Error(`Invalid total_parking_time: "${payload.total_parking_time}" must be a valid non-negative number`);
                }
                payloadTotalParkingTime = BigInt(Math.round(numValue * 3600));
            }
            if (!existing || existing.total_parking_time !== payloadTotalParkingTime) {
                cdrUpdateFields.total_parking_time = payloadTotalParkingTime;
            }
        }
        if (payload.total_parking_cost !== undefined && (!existing || !isEqual(existing.total_parking_cost, payload.total_parking_cost))) {
            cdrUpdateFields.total_parking_cost = payload.total_parking_cost ? (payload.total_parking_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.total_reservation_cost !== undefined && (!existing || !isEqual(existing.total_reservation_cost, payload.total_reservation_cost))) {
            cdrUpdateFields.total_reservation_cost = payload.total_reservation_cost ? (payload.total_reservation_cost as Prisma.InputJsonValue) : undefined;
        }
        if (payload.remark !== undefined && (!existing || existing.remark !== payload.remark)) {
            cdrUpdateFields.remark = payload.remark ?? null;
        }
        if (payload.invoice_reference_id !== undefined && (!existing || existing.invoice_reference_id !== payload.invoice_reference_id)) {
            cdrUpdateFields.invoice_reference_id = payload.invoice_reference_id ?? null;
        }
        if (payload.credit !== undefined && (!existing || existing.credit !== payload.credit)) {
            cdrUpdateFields.credit = payload.credit ?? null;
        }
        if (payload.credit_reference_id !== undefined && (!existing || existing.credit_reference_id !== payload.credit_reference_id)) {
            cdrUpdateFields.credit_reference_id = payload.credit_reference_id ?? null;
        }
        if (payload.remarks !== undefined && (!existing || existing.remarks !== payload.remarks)) {
            cdrUpdateFields.remarks = payload.remarks ?? null;
        }
        if (payload.last_updated !== undefined) {
            const lastUpdated = payload.last_updated ?? new Date().toISOString();
            const payloadLastUpdated = this.validateAndParseDate(
                lastUpdated,
                'last_updated',
                reqId
            );
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                cdrUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildCdrUpdateFields in CDRService`, { 
                data: { ...logData, fieldCount: Object.keys(cdrUpdateFields).length } 
            });

            return cdrUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildCdrUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}

