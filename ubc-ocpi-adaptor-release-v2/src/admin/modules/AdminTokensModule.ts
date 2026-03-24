import { Request } from 'express';
import { Prisma, Token } from '@prisma/client';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { databaseService } from '../../services/database.service';
import { OCPIToken } from '../../ocpi/schema/modules/tokens/types';
import { OCPITokenResponse } from '../../ocpi/schema/modules/tokens/types/responses';
import OCPIv221TokensModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/tokens/OCPIv221TokensModuleOutgoingRequestService';
import { logger } from '../../services/logger.service';

/**
 * Admin Tokens module
 *
 * Responsibility:
 *  - Accept OCPI Token payloads from admin APIs
 *  - Store / update them in the local database (Prisma Token model)
 *  - Call the CPO OCPI Tokens endpoint (outgoing EMSP → CPO)
 *
 * All token payloads are exactly the OCPI 2.2.1 OCPIToken shape.
 */
export default class AdminTokensModule {
    /**
     * POST /api/admin/ocpi/tokens
     *
     * Body: OCPIToken (OCPI 2.2.1)
     *
     * Behaviour:
     *  - Upsert token into local DB (Token model)
     *  - Call CPO PUT /tokens/{country_code}/{party_id}/{token_uid}
     *  - Return the raw OCPI response from CPO wrapped in AdminResponsePayload
     */
    public static async upsertTokenAndSyncWithCPO(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPITokenResponse>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'upsertTokenAndSyncWithCPO' };

        try {
            logger.debug(`🟡 [${reqId}] Starting upsertTokenAndSyncWithCPO in AdminTokensModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in upsertTokenAndSyncWithCPO`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const { partner_id: partnerId, ...rawToken } = req.body as (OCPIToken & {
                partner_id?: string;
            });

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in upsertTokenAndSyncWithCPO`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const tokenPayload = rawToken as OCPIToken | undefined;

            if (!tokenPayload) {
                logger.warn(`🟡 [${reqId}] Token payload missing in upsertTokenAndSyncWithCPO`, { data: logData });
                throw new ValidationError('OCPI token payload is required');
            }

            const prisma = databaseService.prisma;

            // 1) Upsert in local DB
            logger.debug(`🟡 [${reqId}] Finding existing token in database in upsertTokenAndSyncWithCPO`, { 
                data: { ...logData, token_uid: tokenPayload.uid, country_code: tokenPayload.country_code, party_id: tokenPayload.party_id } 
            });
            const existing = await prisma.token.findFirst({
                where: {
                    country_code: tokenPayload.country_code,
                    party_id: tokenPayload.party_id,
                    uid: tokenPayload.uid,
                },
            });

            const tokenCreateData = AdminTokensModule.mapOcpiTokenToPrisma(tokenPayload, partnerId);

            let stored: Token;
            if (existing) {
                logger.debug(`🟡 [${reqId}] Updating existing token in database in upsertTokenAndSyncWithCPO`, { 
                    data: { ...logData, token_id: existing.id } 
                });
                const tokenUpdateData: Prisma.TokenUncheckedUpdateInput = {
                    ...tokenCreateData,
                };
                stored = await prisma.token.update({
                    where: { id: existing.id },
                    data: tokenUpdateData,
                });
                logger.debug(`🟢 [${reqId}] Updated token in database in upsertTokenAndSyncWithCPO`, { 
                    data: { ...logData, token_id: stored.id } 
                });
            }
            else {
                logger.debug(`🟡 [${reqId}] Creating new token in database in upsertTokenAndSyncWithCPO`, { 
                    data: { ...logData, token_uid: tokenPayload.uid } 
                });
                stored = await prisma.token.create({
                    data: tokenCreateData,
                });
                logger.debug(`🟢 [${reqId}] Created token in database in upsertTokenAndSyncWithCPO`, { 
                    data: { ...logData, token_id: stored.id } 
                });
            }

            // 2) Resolve CPO partner credentials and call CPO Tokens endpoint (PUT)
            logger.debug(`🟡 [${reqId}] Finding partner in upsertTokenAndSyncWithCPO`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in upsertTokenAndSyncWithCPO`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in upsertTokenAndSyncWithCPO`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in upsertTokenAndSyncWithCPO`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            logger.debug(`🟡 [${reqId}] Sending PUT token to CPO in upsertTokenAndSyncWithCPO`, { 
                data: { ...logData, token_uid: stored.uid, partner_id: partnerId } 
            });
            const cpoResponse = await OCPIv221TokensModuleOutgoingRequestService.sendPutTokenDirect(
                AdminTokensModule.mapPrismaTokenToOcpi(stored),
                creds.cpo_auth_token,
                partnerId,
                req.headers as Record<string, string>,
            );

            logger.debug(`🟢 [${reqId}] Received response from CPO in upsertTokenAndSyncWithCPO`, { 
                data: { ...logData, httpStatus: cpoResponse.httpStatus } 
            });

            logger.debug(`🟢 [${reqId}] Returning upsertTokenAndSyncWithCPO response`, { 
                data: { ...logData, httpStatus: cpoResponse.httpStatus } 
            });

            return {
                httpStatus: cpoResponse.httpStatus,
                payload: {
                    data: cpoResponse.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in upsertTokenAndSyncWithCPO: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    private static mapPrismaTokenToOcpi(token: Token): OCPIToken {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: token.type as unknown as OCPIToken['type'],
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? undefined,
            issuer: token.issuer,
            group_id: token.group_id ?? undefined,
            valid: token.valid,
            whitelist: token.whitelist as unknown as OCPIToken['whitelist'],
            language: token.language ?? undefined,
            default_profile_type:
                (token.default_profile_type as unknown as OCPIToken['default_profile_type']) ||
                undefined,
            energy_contract: token.energy_contract as unknown as OCPIToken['energy_contract'],
            last_updated: token.last_updated.toISOString(),
        };
    }

    private static mapOcpiTokenToPrisma(
        token: OCPIToken,
        partnerId: string,
    ): Prisma.TokenUncheckedCreateInput {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: String(token.type),
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? null,
            issuer: token.issuer,
            group_id: token.group_id ?? null,
            valid: token.valid,
            whitelist: String(token.whitelist),
            language: token.language ?? null,
            default_profile_type: token.default_profile_type
                ? String(token.default_profile_type)
                : null,
            energy_contract: token.energy_contract
                ? (token.energy_contract as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            last_updated: new Date(token.last_updated ?? new Date().toISOString()),
            deleted: false,
            partner_id: partnerId,
        };
    }
}


