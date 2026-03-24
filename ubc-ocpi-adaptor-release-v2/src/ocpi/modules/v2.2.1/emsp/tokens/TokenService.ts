import { Prisma, Token } from '@prisma/client';
import {
    OCPIToken,
    OCPIPatchToken,
} from '../../../../schema/modules/tokens/types';
import { isEqual } from 'lodash';
import { logger } from '../../../../../services/logger.service';

/**
 * Service for building create and update fields from OCPI token payloads
 * Only includes fields that are present in the payload
 */
export class TokenService {
    /**
     * Build token create fields from OCPI payload - only includes fields present in payload
     */
    public static buildTokenCreateFields(
        payload: OCPIToken,
        partnerId: string,
    ): Prisma.TokenUncheckedCreateInput {
        const reqId = 'internal';
        const logData = { action: 'buildTokenCreateFields', partnerId, tokenUid: payload.uid };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildTokenCreateFields in TokenService`, { data: logData });

            const tokenCreateFields: Prisma.TokenUncheckedCreateInput = {
            partner_id: partnerId,
            deleted: false,
            country_code: payload.country_code,
            party_id: payload.party_id,
            uid: payload.uid,
            type: String(payload.type),
            contract_id: payload.contract_id,
            issuer: payload.issuer,
            valid: payload.valid,
            whitelist: String(payload.whitelist),
            last_updated: new Date(payload.last_updated ?? new Date().toISOString()),
        };

        if (payload.country_code !== undefined) tokenCreateFields.country_code = payload.country_code;
        if (payload.party_id !== undefined) tokenCreateFields.party_id = payload.party_id;
        if (payload.uid !== undefined) tokenCreateFields.uid = payload.uid;
        if (payload.type !== undefined) tokenCreateFields.type = String(payload.type);
        if (payload.contract_id !== undefined) tokenCreateFields.contract_id = payload.contract_id;
        if (payload.visual_number !== undefined) tokenCreateFields.visual_number = payload.visual_number ?? null;
        if (payload.issuer !== undefined) tokenCreateFields.issuer = payload.issuer;
        if (payload.group_id !== undefined) tokenCreateFields.group_id = payload.group_id ?? null;
        if (payload.valid !== undefined) tokenCreateFields.valid = payload.valid;
        if (payload.whitelist !== undefined) tokenCreateFields.whitelist = String(payload.whitelist);
        if (payload.language !== undefined) tokenCreateFields.language = payload.language ?? null;
        if (payload.default_profile_type !== undefined) tokenCreateFields.default_profile_type = payload.default_profile_type ? String(payload.default_profile_type) : null;
        if (payload.energy_contract !== undefined) tokenCreateFields.energy_contract = payload.energy_contract as Prisma.InputJsonValue;
        if (payload.last_updated !== undefined) tokenCreateFields.last_updated = new Date(payload.last_updated ?? new Date().toISOString());

            logger.debug(`🟢 [${reqId}] Completed buildTokenCreateFields in TokenService`, { 
                data: { ...logData, fieldCount: Object.keys(tokenCreateFields).length } 
            });

            return tokenCreateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildTokenCreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build token update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildTokenUpdateFields(
        payload: OCPIToken | OCPIPatchToken,
        existing?: Token | null,
    ): Prisma.TokenUncheckedUpdateInput {
        const reqId = 'internal';
        const logData = { action: 'buildTokenUpdateFields', tokenUid: payload.uid, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildTokenUpdateFields in TokenService`, { data: logData });

            const tokenUpdateFields: Prisma.TokenUncheckedUpdateInput = {};

        if (payload.country_code !== undefined && (!existing || existing.country_code !== payload.country_code)) {
            tokenUpdateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined && (!existing || existing.party_id !== payload.party_id)) {
            tokenUpdateFields.party_id = payload.party_id;
        }
        if (payload.uid !== undefined && (!existing || existing.uid !== payload.uid)) {
            tokenUpdateFields.uid = payload.uid;
        }
        if (payload.type !== undefined && (!existing || existing.type !== String(payload.type))) {
            tokenUpdateFields.type = String(payload.type);
        }
        if (payload.contract_id !== undefined && (!existing || existing.contract_id !== payload.contract_id)) {
            tokenUpdateFields.contract_id = payload.contract_id;
        }
        if (payload.visual_number !== undefined && (!existing || existing.visual_number !== payload.visual_number)) {
            tokenUpdateFields.visual_number = payload.visual_number ?? null;
        }
        if (payload.issuer !== undefined && (!existing || existing.issuer !== payload.issuer)) {
            tokenUpdateFields.issuer = payload.issuer;
        }
        if (payload.group_id !== undefined && (!existing || existing.group_id !== payload.group_id)) {
            tokenUpdateFields.group_id = payload.group_id ?? null;
        }
        if (payload.valid !== undefined && (!existing || existing.valid !== payload.valid)) {
            tokenUpdateFields.valid = payload.valid;
        }
        if (payload.whitelist !== undefined && (!existing || existing.whitelist !== String(payload.whitelist))) {
            tokenUpdateFields.whitelist = String(payload.whitelist);
        }
        if (payload.language !== undefined && (!existing || existing.language !== payload.language)) {
            tokenUpdateFields.language = payload.language ?? null;
        }
        if (payload.default_profile_type !== undefined && (!existing || existing.default_profile_type !== (payload.default_profile_type ? String(payload.default_profile_type) : null))) {
            tokenUpdateFields.default_profile_type = payload.default_profile_type ? String(payload.default_profile_type) : null;
        }
        if (payload.energy_contract !== undefined && (!existing || !isEqual(existing.energy_contract, payload.energy_contract))) {
            tokenUpdateFields.energy_contract = payload.energy_contract as Prisma.InputJsonValue;
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated);
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                tokenUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildTokenUpdateFields in TokenService`, { 
                data: { ...logData, fieldCount: Object.keys(tokenUpdateFields).length } 
            });

            return tokenUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildTokenUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}

