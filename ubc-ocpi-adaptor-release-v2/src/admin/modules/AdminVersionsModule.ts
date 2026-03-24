import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../services/logger.service';
import {
    OCPIVersionClass,
} from '../../ocpi/schema/modules/verisons/types';
import {
    OCPIv211VersionDetailResponse,
    OCPIVersionDetailResponse,
} from '../../ocpi/schema/modules/verisons/types/responses';
import { databaseService } from '../../services/database.service';
import OCPIv221VersionsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/versions/OCPIv221VersionsModuleOutgoingRequestService';
import { OCPIVersionNumber } from '../../ocpi/schema/modules/verisons/enums';

type VersionDetailUnion = OCPIVersionDetailResponse | OCPIv211VersionDetailResponse;

export default class AdminVersionsModule {
    /**
     * POST /api/admin/ocpi/versions
     *
     * Calls the CPO /versions endpoint for a given partner and stores any new
     * versions in the OCPIVersion table.
     *
     * Body: { partner_id }
     * - versions_url is read from OCPIPartner.versions_url
     * - cpo_token is read from OCPIPartnerCredentials.cpo_auth_token
     */
    public static async getCpoVersions(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<unknown>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'getCpoVersions' };

        try {
            logger.debug(`🟡 [${reqId}] Starting getCpoVersions in AdminVersionsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in getCpoVersions`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const { partner_id: partnerId } = req.body as { partner_id?: string };
            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in getCpoVersions`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in getCpoVersions`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in getCpoVersions`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in getCpoVersions`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            if (!partner.versions_url) {
                logger.warn(`🟡 [${reqId}] Partner missing versions_url in getCpoVersions`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner is missing versions_url');
            }

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in getCpoVersions`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            logger.debug(`🟡 [${reqId}] Fetching versions from CPO in getCpoVersions`, { 
                data: { ...logData, versions_url: partner.versions_url } 
            });
            const versions: OCPIVersionClass[] =
                await OCPIv221VersionsModuleOutgoingRequestService.getVersions(
                    partner.versions_url,
                    creds.cpo_auth_token,
                    partner.id,
                    req.headers as Record<string, string>,
                );

            logger.debug(`🟢 [${reqId}] Received versions from CPO in getCpoVersions`, { 
                data: { ...logData, versions_count: versions.length } 
            });

            // Create versions only if they do not already exist
            logger.debug(`🟡 [${reqId}] Upserting versions in database in getCpoVersions`, { 
                data: { ...logData, versions_count: versions.length } 
            });
            for (const v of versions) {
                const existing = await prisma.oCPIVersion.findFirst({
                    where: {
                        partner_id: partner.id,
                        version_id: v.version,
                        deleted: false,
                    },
                });
                if (!existing) {
                    await prisma.oCPIVersion.create({
                        data: {
                            partner_id: partner.id,
                            version_id: v.version,
                            version_url: v.url,
                        },
                    });
                    logger.debug(`🟢 [${reqId}] Created version in database in getCpoVersions`, { 
                        data: { ...logData, version: v.version } 
                    });
                }
            }

            logger.debug(`🟢 [${reqId}] Returning getCpoVersions response`, { 
                data: { ...logData, versions_count: versions.length } 
            });

            return {
                payload: {
                    data: {
                        success: true,
                        versions,
                    },
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getCpoVersions: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * POST /api/admin/ocpi/version-details
     *
     * Calls the CPO version-details endpoint for a given partner + version and
     * stores any new endpoints in the OCPIPartnerEndpoint table.
     *
     * Body: { partner_id, version_id? }
     * - If version_id is omitted, prefers 2.2.1, otherwise first version in OCPIVersion.
     */
    public static async getCpoVersionDetails(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<unknown>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'getCpoVersionDetails' };

        try {
            logger.debug(`🟡 [${reqId}] Starting getCpoVersionDetails in AdminVersionsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in getCpoVersionDetails`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const { partner_id: partnerId } = req.body as {
                partner_id?: string;
            };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in getCpoVersionDetails`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in getCpoVersionDetails`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true, versions: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in getCpoVersionDetails`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in getCpoVersionDetails`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in getCpoVersionDetails`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            const versions = partner.versions.filter((v) => !v.deleted);
            if (versions.length === 0) {
                logger.warn(`🟡 [${reqId}] No stored versions for partner in getCpoVersionDetails`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('No stored versions for this partner, call /versions first');
            }

            logger.debug(`🟡 [${reqId}] Selecting version in getCpoVersionDetails`, { 
                data: { ...logData, available_versions: versions.map(v => v.version_id) } 
            });
            const v221Version = versions.find((v) => v.version_id === OCPIVersionNumber.v2_2_1);
            const v211Version = versions.find((v) => v.version_id === OCPIVersionNumber.v2_1_1);

            const selected = v221Version ?? v211Version;
            if (!selected) {
                logger.warn(`🟡 [${reqId}] No valid version found in getCpoVersionDetails`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('No valid version found for this partner');
            }

            logger.debug(`🟢 [${reqId}] Selected version in getCpoVersionDetails`, { 
                data: { ...logData, version: selected.version_id, version_url: selected.version_url } 
            });

            logger.debug(`🟡 [${reqId}] Fetching version details from CPO in getCpoVersionDetails`, { 
                data: { ...logData, version_url: selected.version_url } 
            });
            const versionDetails: VersionDetailUnion =
                await OCPIv221VersionsModuleOutgoingRequestService.getVersionDetails(
                    selected.version_url,
                    creds.cpo_auth_token,
                    selected.version_id,
                    partner.id,
                    req.headers as Record<string, string>,
                );

            logger.debug(`🟢 [${reqId}] Received version details from CPO in getCpoVersionDetails`, { 
                data: { ...logData, endpoints_count: versionDetails.endpoints?.length || 0 } 
            });

            const endpoints = versionDetails.endpoints ?? [];

            // Create endpoints only if they do not already exist
            logger.debug(`🟡 [${reqId}] Upserting endpoints in database in getCpoVersionDetails`, { 
                data: { ...logData, endpoints_count: endpoints.length } 
            });
            for (const endpoint of endpoints) {
                const existing = await prisma.oCPIPartnerEndpoint.findFirst({
                    where: {
                        partner_id: partner.id,
                        version: versionDetails.version,
                        module: String(endpoint.identifier),
                        role: 'role' in endpoint && (endpoint as any).role ? String((endpoint as any).role) : '',
                        deleted: false,
                    },
                });

                if (!existing) {
                    await prisma.oCPIPartnerEndpoint.create({
                        data: {
                            partner_id: partner.id,
                            version: versionDetails.version,
                            module: String(endpoint.identifier),
                            role: 'role' in endpoint && (endpoint as any).role ? String((endpoint as any).role) : '',
                            url: endpoint.url,
                        },
                    });
                    logger.debug(`🟢 [${reqId}] Created endpoint in database in getCpoVersionDetails`, { 
                        data: { ...logData, module: endpoint.identifier, url: endpoint.url } 
                    });
                }
            }

            logger.debug(`🟢 [${reqId}] Returning getCpoVersionDetails response`, { 
                data: { ...logData, endpoints_count: endpoints.length } 
            });

            return {
                payload: {
                    data: {
                        success: true,
                        version_details: versionDetails,
                        endpoints_count: endpoints.length,
                    },
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getCpoVersionDetails: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}


