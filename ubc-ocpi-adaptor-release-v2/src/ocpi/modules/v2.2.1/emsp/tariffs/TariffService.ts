import { Prisma, Tariff } from '@prisma/client';
import {
    OCPITariff,
    OCPIPatchTariff,
} from '../../../../schema/modules/tariffs/types';
import { isEqual } from 'lodash';
import { logger } from '../../../../../services/logger.service';

/**
 * Service for building create and update fields from OCPI tariff payloads
 * Only includes fields that are present in the payload
 */
export class TariffService {
    /**
     * Build tariff create fields from OCPI payload - only includes fields present in payload
     */
    public static buildTariffCreateFields(
        payload: OCPITariff,
        partnerId: string,
    ): Prisma.TariffUncheckedCreateInput {
        const reqId = 'internal';
        const logData = { action: 'buildTariffCreateFields', partnerId, tariffId: payload.id };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildTariffCreateFields in TariffService`, { data: logData });

            const tariffCreateFields: Prisma.TariffUncheckedCreateInput = {
            partner_id: partnerId,
            country_code: payload.country_code,
            party_id: payload.party_id,
            ocpi_tariff_id: payload.id,
            currency: payload.currency,
            last_updated: new Date(payload.last_updated),
        };

        if (payload.type !== undefined) tariffCreateFields.type = payload.type;
        if (payload.tariff_alt_text !== undefined) tariffCreateFields.tariff_alt_text = payload.tariff_alt_text as Prisma.InputJsonValue;
        if (payload.tariff_alt_url !== undefined) tariffCreateFields.tariff_alt_url = payload.tariff_alt_url ?? null;
        if (payload.min_price !== undefined) tariffCreateFields.min_price = payload.min_price as Prisma.InputJsonValue;
        if (payload.max_price !== undefined) tariffCreateFields.max_price = payload.max_price as Prisma.InputJsonValue;
        if (payload.start_date_time !== undefined) tariffCreateFields.start_date_time = payload.start_date_time ? new Date(payload.start_date_time) : null;
        if (payload.end_date_time !== undefined) tariffCreateFields.end_date_time = payload.end_date_time ? new Date(payload.end_date_time) : null;
        if (payload.energy_mix !== undefined) tariffCreateFields.energy_mix = payload.energy_mix as Prisma.InputJsonValue;
        if (payload.elements !== undefined) tariffCreateFields.ocpi_tariff_element = payload.elements as unknown as Prisma.InputJsonValue;
        if (payload.last_updated !== undefined) tariffCreateFields.last_updated = new Date(payload.last_updated);

            logger.debug(`🟢 [${reqId}] Completed buildTariffCreateFields in TariffService`, { 
                data: { ...logData, fieldCount: Object.keys(tariffCreateFields).length } 
            });

            return tariffCreateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildTariffCreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build tariff update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildTariffUpdateFields(
        payload: OCPITariff | OCPIPatchTariff,
        existing?: Tariff | null,
    ): Prisma.TariffUncheckedUpdateInput {
        const reqId = 'internal';
        const tariffId = 'id' in payload ? payload.id : undefined;
        const logData = { action: 'buildTariffUpdateFields', tariffId, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildTariffUpdateFields in TariffService`, { data: logData });

            const tariffUpdateFields: Prisma.TariffUncheckedUpdateInput = {};

        if (payload.country_code !== undefined && (!existing || existing.country_code !== payload.country_code)) {
            tariffUpdateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined && (!existing || existing.party_id !== payload.party_id)) {
            tariffUpdateFields.party_id = payload.party_id;
        }
        if ('id' in payload && payload.id !== undefined && (!existing || existing.ocpi_tariff_id !== payload.id)) {
            tariffUpdateFields.ocpi_tariff_id = payload.id;
        }
        if (payload.currency !== undefined && (!existing || existing.currency !== payload.currency)) {
            tariffUpdateFields.currency = payload.currency;
        }
        if (payload.type !== undefined && (!existing || existing.type !== payload.type)) {
            tariffUpdateFields.type = payload.type;
        }
        if (payload.tariff_alt_text !== undefined && (!existing || !isEqual(existing.tariff_alt_text, payload.tariff_alt_text))) {
            tariffUpdateFields.tariff_alt_text = payload.tariff_alt_text as Prisma.InputJsonValue;
        }
        if (payload.tariff_alt_url !== undefined && (!existing || existing.tariff_alt_url !== payload.tariff_alt_url)) {
            tariffUpdateFields.tariff_alt_url = payload.tariff_alt_url ?? null;
        }
        if (payload.min_price !== undefined && (!existing || !isEqual(existing.min_price, payload.min_price))) {
            tariffUpdateFields.min_price = payload.min_price as Prisma.InputJsonValue;
        }
        if (payload.max_price !== undefined && (!existing || !isEqual(existing.max_price, payload.max_price))) {
            tariffUpdateFields.max_price = payload.max_price as Prisma.InputJsonValue;
        }
        if (payload.start_date_time !== undefined) {
            const payloadStartDate = payload.start_date_time ? new Date(payload.start_date_time) : null;
            const existingStartDate = existing?.start_date_time ?? null;
            if (!existing || existingStartDate?.getTime() !== payloadStartDate?.getTime()) {
                tariffUpdateFields.start_date_time = payloadStartDate;
            }
        }
        if (payload.end_date_time !== undefined) {
            const payloadEndDate = payload.end_date_time ? new Date(payload.end_date_time) : null;
            const existingEndDate = existing?.end_date_time ?? null;
            if (!existing || existingEndDate?.getTime() !== payloadEndDate?.getTime()) {
                tariffUpdateFields.end_date_time = payloadEndDate;
            }
        }
        if (payload.energy_mix !== undefined && (!existing || !isEqual(existing.energy_mix, payload.energy_mix))) {
            tariffUpdateFields.energy_mix = payload.energy_mix as Prisma.InputJsonValue;
        }
        if ('elements' in payload && payload.elements !== undefined && (!existing || !isEqual(existing.ocpi_tariff_element, payload.elements))) {
            tariffUpdateFields.ocpi_tariff_element = payload.elements as unknown as Prisma.InputJsonValue;
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated);
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                tariffUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildTariffUpdateFields in TariffService`, { 
                data: { ...logData, fieldCount: Object.keys(tariffUpdateFields).length } 
            });

            return tariffUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildTariffUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}

