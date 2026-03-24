import { Request } from 'express';
import { randomUUID } from 'crypto';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { OCPICredentials, OCPICredentialsRoleClass } from '../../ocpi/schema/modules/credentials/types';
import { databaseService } from '../../services/database.service';
import { OCPIResponsePayload } from '../../ocpi/schema/general/types/responses';
import { OCPIResponseStatusCode } from '../../ocpi/schema/general/enum';
import OCPIv221CredentialsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/credentials/OCPIv221CredentialsModuleOutgoingRequestService';
import OCPIResponseService from '../../ocpi/services/OCPIResponseService';
import OCPIPartnerDbService from '../../db-services/OCPIPartnerDbService';
import { Prisma } from '@prisma/client';
import { OCPIPartnerCredentialsDbService } from '../../db-services/OCPIPartnerCredentialsDbService';
import { AdminRegisterRequestPayload } from '../types/request';
import AdminVersionsModule from './AdminVersionsModule';
import { OCPIVersionClass } from '../../ocpi/schema/modules/verisons/types';
import { OCPIVersionDetailResponse } from '../../ocpi/schema/modules/verisons/types/responses';
import { OCPIPartnerEndpointDbService } from '../../db-services/OCPIPartnerEndpointDbService';
import { OCPIVersionNumber } from '../../ocpi/schema/modules/verisons/enums';
import { logger } from '../../services/logger.service';

export default class AdminCredentialsModule {
    /**
     * POST /api/admin/ocpi/credentials/send
     *
     * Directly POST a raw OCPI Credentials object to a CPO.
     * Request body MUST be the OCPI credentials payload:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role }]
     *   partner_id: string;
     * }
     */
    public static async sendPostCredentials(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPIResponsePayload<OCPICredentials>>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'sendPostCredentials' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPostCredentials in AdminCredentialsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in sendPostCredentials`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const {
                token,
                url,
                roles,
                partner_id,
            } = req.body as {
                token: string;
                url: string;
                roles: OCPICredentialsRoleClass[];
                partner_id: string;
            };

            logger.debug(`🟡 [${reqId}] Finding partner in sendPostCredentials`, { 
                data: { ...logData, partner_id } 
            });
            const partner = await databaseService.prisma.oCPIPartner.findUnique({
                where: { id: partner_id },
                include: { credentials: true },
            });
            if (!partner) {
                logger.warn(`🟡 [${reqId}] Partner not found in sendPostCredentials`, { 
                    data: { ...logData, partner_id } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in sendPostCredentials`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const credentials = partner.credentials;
            if (!credentials || !credentials.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in sendPostCredentials`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            // fetch from ocpi partner endpoints table
            logger.debug(`🟡 [${reqId}] Finding CPO credentials URL in sendPostCredentials`, { 
                data: { ...logData, partner_id: partner.id } 
            });
            const cpoCredentialsUrl = await databaseService.prisma.oCPIPartnerEndpoint.findFirst({
                where: { partner_id: partner.id, module: 'credentials', role: 'RECEIVER' },
                select: { url: true },
            });

            if (!cpoCredentialsUrl) {
                logger.warn(`🟡 [${reqId}] CPO credentials URL not found in sendPostCredentials`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials URL not found');
            }

            logger.debug(`🟢 [${reqId}] Found CPO credentials URL in sendPostCredentials`, { 
                data: { ...logData, url: cpoCredentialsUrl.url } 
            });

            logger.debug(`🟡 [${reqId}] Sending POST credentials to CPO in sendPostCredentials`, { 
                data: { ...logData, url: cpoCredentialsUrl.url } 
            });
            const response = await OCPIv221CredentialsModuleOutgoingRequestService.sendPostCredentials(
                credentials.cpo_auth_token,
                cpoCredentialsUrl?.url || '',
                token,
                url,
                roles,
                partner.id,
                req.headers as Record<string, string>,
            );

            logger.debug(`🟢 [${reqId}] Received response from CPO in sendPostCredentials`, { 
                data: { ...logData, httpStatus: response.httpStatus } 
            });

            if (response.payload.data?.token) {
                logger.debug(`🟡 [${reqId}] Updating CPO partner credentials in sendPostCredentials`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                await databaseService.prisma.oCPIPartnerCredentials.update({
                    where: { partner_id: partner.id },
                    data: { cpo_auth_token: response.payload.data?.token },
                });

                logger.debug(`🟡 [${reqId}] Updating partner status to ACTIVE in sendPostCredentials`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                await databaseService.prisma.oCPIPartner.update({
                    where: { id: partner.id },
                    data: { status: 'ACTIVE' },
                });
            }

            logger.debug(`🟢 [${reqId}] Returning sendPostCredentials response`, { 
                data: { ...logData, httpStatus: response.httpStatus } 
            });

            return {
                httpStatus: response.httpStatus,
                payload: {
                    data: response.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPostCredentials: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * GET /api/admin/ocpi/credentials
     *
     * Calls the CPO GET /credentials endpoint for a given partner and returns
     * the raw OCPI credentials response.
     *
     * Query: ?partner_id=<OCPIPartner.id>
     */
    public static async getCpoCredentials(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPIResponsePayload<OCPICredentials>>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'getCpoCredentials' };

        try {
            logger.debug(`🟡 [${reqId}] Starting getCpoCredentials in AdminCredentialsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing query parameters in getCpoCredentials`, { 
                data: { ...logData, query: req.query } 
            });
            const { partner_id: partnerId } = req.query as { partner_id?: string };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in getCpoCredentials`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in getCpoCredentials`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true, endpoints: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in getCpoCredentials`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in getCpoCredentials`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in getCpoCredentials`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            logger.debug(`🟡 [${reqId}] Finding credentials endpoint in getCpoCredentials`, { 
                data: { ...logData, partner_id: partner.id } 
            });
            const endpoint = partner.endpoints.find(
                (e) => !e.deleted && e.module === 'credentials' && e.role === 'SENDER',
            );
            if (!endpoint) {
                logger.warn(`🟡 [${reqId}] Credentials endpoint not found in getCpoCredentials`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials endpoint (module=credentials, role=SENDER) not found');
            }

            logger.debug(`🟢 [${reqId}] Found credentials endpoint in getCpoCredentials`, { 
                data: { ...logData, url: endpoint.url } 
            });

            logger.debug(`🟡 [${reqId}] Sending GET credentials to CPO in getCpoCredentials`, { 
                data: { ...logData, url: endpoint.url } 
            });
            const response = await OCPIv221CredentialsModuleOutgoingRequestService.sendGetCredentials(
                endpoint.url,
                creds.cpo_auth_token,
                partner.id,
                req.headers as Record<string, string>,
            );

            logger.debug(`🟢 [${reqId}] Received response from CPO in getCpoCredentials`, { 
                data: { ...logData, httpStatus: response.httpStatus } 
            });

            logger.debug(`🟢 [${reqId}] Returning getCpoCredentials response`, { 
                data: { ...logData, httpStatus: response.httpStatus } 
            });

            return {
                httpStatus: response.httpStatus,
                payload: {
                    data: response.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getCpoCredentials: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Upsert an OCPI CPO partner + credentials from a raw OCPI Credentials payload.
     *
     * Intended for admin/bootstrap flows where you manually paste the CPO's
     * credentials JSON (token, roles, url) and want to persist/update the
     * corresponding `OCPIPartner` and `OCPIPartnerCredentials` records.
     *
     * Body:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role, business_details? }]
     * }
     */
    public static async registerCpoFromCredentialsPayload(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'registerCpoFromCredentialsPayload' };
        // Extract request/correlation IDs from incoming request to pass through
        const correlationId = req.headers['x-correlation-id'] as string || req.headers['X-Correlation-Id'] as string;
        const requestId = req.headers['x-request-id'] as string || req.headers['X-Request-Id'] as string;

        try {
            logger.debug(`🟡 [${reqId}] Starting registerCpoFromCredentialsPayload in AdminCredentialsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing request body in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, hasBody: !!req.body } 
            });
            const payload = req.body as AdminRegisterRequestPayload | undefined;

            if (!payload) {
                logger.warn(`🟡 [${reqId}] Payload missing in registerCpoFromCredentialsPayload`, { data: logData });
                throw new ValidationError('OCPI credentials payload is required');
            }
    
            logger.debug(`🟡 [${reqId}] Extracting payload fields in registerCpoFromCredentialsPayload`, { 
                data: { ...logData } 
            });
            const { cpo_auth_token: cpoAuthToken, cpo_versions_url: cpoVersionsUrl, cpo_party_id: cpoPartyId, cpo_country_code: cpoCountryCode, cpo_name: cpoName, emsp_ocpi_host: emspOcpiHost, emsp_party_id: emspPartyId = "EMSP", emsp_country_code: emspCountryCode = "IN", emsp_name: emspName = "EMSP PARTNER"} = payload;
            let { emsp_auth_token: emspAuthToken } = payload;

            if (!cpoAuthToken) {
                logger.warn(`🟡 [${reqId}] cpo_auth_token missing in registerCpoFromCredentialsPayload`, { data: logData });
                throw new ValidationError('cpo_auth_token is required');
            }
            if (!cpoVersionsUrl) {
                logger.warn(`🟡 [${reqId}] cpo_versions_url missing in registerCpoFromCredentialsPayload`, { data: logData });
                throw new ValidationError('cpo_versions_url is required');
            }
            if (!cpoPartyId) {
                logger.warn(`🟡 [${reqId}] cpo_party_id missing in registerCpoFromCredentialsPayload`, { data: logData });
                throw new ValidationError('cpo_party_id is required');
            }
            if (!cpoCountryCode) {
                logger.warn(`🟡 [${reqId}] cpo_country_code missing in registerCpoFromCredentialsPayload`, { data: logData });
                throw new ValidationError('cpo_country_code is required');
            }
            if (!cpoName) {
                logger.warn(`🟡 [${reqId}] cpo_name missing in registerCpoFromCredentialsPayload`, { data: logData });
                throw new ValidationError('cpo_name is required');
            }
    
            // 1) Upsert OCPIPartner (by country_code + party_id + role = CPO)
            logger.debug(`🟡 [${reqId}] Finding/creating CPO partner in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, cpoCountryCode, cpoPartyId } 
            });
            let partner = await OCPIPartnerDbService.getFirstByFilter({
                where: {
                    country_code: cpoCountryCode,
                    party_id: cpoPartyId,
                    role: 'CPO',
                    deleted: false,
                },
            });
    
            if (partner) {
                logger.debug(`🟢 [${reqId}] Found existing CPO partner, updating in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                const partnerUpdateFields: Prisma.OCPIPartnerUncheckedUpdateInput = {};
                if (cpoName) {
                    partnerUpdateFields.name = cpoName;
                }
    
                partner = await OCPIPartnerDbService.update(partner.id, partnerUpdateFields);
            }
            else {
                logger.debug(`🟡 [${reqId}] Creating new CPO partner in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, cpoName, cpoCountryCode, cpoPartyId } 
                });
                const partnerCreateFields: Prisma.OCPIPartnerCreateInput = {
                    name: cpoName,
                    country_code: cpoCountryCode,
                    party_id: cpoPartyId,
                    role: 'CPO',
                    versions_url: cpoVersionsUrl,
                    status: 'INIT',
                };
    
                partner = await OCPIPartnerDbService.create({ data: partnerCreateFields });
                logger.debug(`🟢 [${reqId}] Created CPO partner in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
            }

            logger.debug(`🟡 [${reqId}] Finding/creating EMSP partner in registerCpoFromCredentialsPayload`, { 
                data: { ...logData } 
            });
            let emspPartner = await OCPIPartnerDbService.getFirstByFilter({
                where: {
                    role: 'EMSP',
                    deleted: false,
                },
            });
    
            if (!emspPartner) {
                logger.debug(`🟡 [${reqId}] Creating new EMSP partner in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData } 
                });
                if (!emspAuthToken) {
                    emspAuthToken = randomUUID();
                    logger.debug(`🟡 [${reqId}] Generated EMSP auth token in registerCpoFromCredentialsPayload`, { 
                        data: { ...logData } 
                    });
                }
                if (!emspName) {
                    logger.warn(`🟡 [${reqId}] emsp_name missing in registerCpoFromCredentialsPayload`, { data: logData });
                    throw new ValidationError('emsp_name is required for first time registration');
                }
                if (!emspPartyId) {
                    logger.warn(`🟡 [${reqId}] emsp_party_id missing in registerCpoFromCredentialsPayload`, { data: logData });
                    throw new ValidationError('emsp_party_id is required for first time registration');
                }
                if (!emspCountryCode) {
                    logger.warn(`🟡 [${reqId}] emsp_country_code missing in registerCpoFromCredentialsPayload`, { data: logData });
                    throw new ValidationError('emsp_country_code is required for first time registration');
                }
                if (!emspOcpiHost) {
                    logger.warn(`🟡 [${reqId}] emsp_ocpi_host missing in registerCpoFromCredentialsPayload`, { data: logData });
                    throw new ValidationError('emsp_ocpi_host is required for first time registration');
                }

                logger.debug(`🟡 [${reqId}] Creating EMSP partner and endpoints in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, emspName, emspCountryCode, emspPartyId } 
                });
                const emspPartnerCreateFields: Prisma.OCPIPartnerCreateInput = {
                    name: emspName,
                    country_code: emspCountryCode,
                    party_id: emspPartyId,
                    role: 'EMSP',
                    versions_url: `${emspOcpiHost}/ocpi/versions`,
                    status: 'ACTIVE',
                };
                emspPartner = await OCPIPartnerDbService.create({ data: emspPartnerCreateFields });
                logger.debug(`🟢 [${reqId}] Created EMSP partner in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, emsp_partner_id: emspPartner.id } 
                });

                // create emsp version
                logger.debug(`🟡 [${reqId}] Creating EMSP version in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, emsp_partner_id: emspPartner.id } 
                });
                const emspVersionCreateFields: Prisma.OCPIVersionCreateInput = {
                    partner: { connect: { id: emspPartner?.id || '' } },
                    version_id: OCPIVersionNumber.v2_2_1,
                    version_url: `${emspOcpiHost}/ocpi/versions/${OCPIVersionNumber.v2_2_1}/details`,
                };

                await databaseService.prisma.oCPIVersion.create({ data: emspVersionCreateFields });
                logger.debug(`🟢 [${reqId}] Created EMSP version in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData } 
                });

                // Create EMSP endpoints
                logger.debug(`🟡 [${reqId}] Creating EMSP endpoints in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, baseUrl: `${emspOcpiHost}/ocpi/${OCPIVersionNumber.v2_2_1}` } 
                });
                const baseUrl = `${emspOcpiHost}/ocpi/${OCPIVersionNumber.v2_2_1}`;
                const emspEndpoints = [
                    { module: 'credentials', role: 'SENDER',   url: `${baseUrl}/credentials` },
                    { module: 'credentials', role: 'RECEIVER', url: `${baseUrl}/credentials` },
                
                    { module: 'locations', role: 'RECEIVER', url: `${baseUrl}/locations` },
                    { module: 'tariffs',   role: 'RECEIVER', url: `${baseUrl}/tariffs` },
                
                    { module: 'sessions', role: 'SENDER',   url: `${baseUrl}/sessions` },
                    { module: 'sessions', role: 'RECEIVER', url: `${baseUrl}/sessions` },
                
                    { module: 'cdrs', role: 'RECEIVER', url: `${baseUrl}/cdrs` },
                
                    { module: 'tokens', role: 'SENDER',   url: `${baseUrl}/tokens` },
                    { module: 'tokens', role: 'RECEIVER', url: `${baseUrl}/tokens` },
                
                    { module: 'commands', role: 'SENDER',   url: `${baseUrl}/commands` },
                    { module: 'commands', role: 'RECEIVER', url: `${baseUrl}/commands` },
                ];
                
                const ocpiEndpointsCreateFields: Prisma.OCPIPartnerEndpointCreateManyInput[] = emspEndpoints.map((endpoint) => ({
                    partner_id: emspPartner?.id || '',
                    module: endpoint.module,
                    role: endpoint.role,
                    url: endpoint.url,
                    version: OCPIVersionNumber.v2_2_1,
                }));
                await OCPIPartnerEndpointDbService.createMultipleEndpoints({ data: ocpiEndpointsCreateFields });
                logger.debug(`🟢 [${reqId}] Created EMSP endpoints in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, count: ocpiEndpointsCreateFields.length } 
                });
            }
            else {
                logger.debug(`🟢 [${reqId}] Found existing EMSP partner in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, emsp_partner_id: emspPartner.id } 
                });
            }
    
            // 2) Upsert OCPIPartnerCredentials for this partner
            logger.debug(`🟡 [${reqId}] Finding/creating partner credentials in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, partner_id: partner.id } 
            });
            let credentials = await OCPIPartnerCredentialsDbService.getByPartnerId(partner.id);
    
            if (!credentials) {
                logger.debug(`🟡 [${reqId}] Creating partner credentials in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                const credentialsCreateFields: Prisma.OCPIPartnerCredentialsCreateInput = {
                    partner: { connect: { id: partner.id } },
                    cpo_auth_token: cpoAuthToken,
                    cpo_url: cpoVersionsUrl,
                    emsp_auth_token: emspAuthToken ?? randomUUID(),
                    emsp_url: emspPartner.versions_url,
                };
                credentials = await OCPIPartnerCredentialsDbService.createCredentials({ data: credentialsCreateFields });
                logger.debug(`🟢 [${reqId}] Created partner credentials in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
            }
            else {
                logger.debug(`🟢 [${reqId}] Found existing partner credentials in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
            }
    
            // Fetch versions from the CPO
            logger.debug(`🟡 [${reqId}] Fetching CPO versions in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, partner_id: partner.id } 
            });
            const cpoVersionsReq = {
                ...req,
                body: {
                    partner_id: partner.id,
                },
                headers: {
                    ...req.headers,
                    'x-correlation-id': correlationId,
                    'X-Correlation-Id': correlationId,
                    'x-request-id': requestId,
                    'X-Request-Id': requestId,
                },
            } as unknown as Request;
            const cpoVersions = await AdminVersionsModule.getCpoVersions(cpoVersionsReq);
    
            if (!(cpoVersions.payload.data as unknown as { success: boolean })?.success) {
                logger.warn(`🟡 [${reqId}] Failed to fetch CPO versions in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('Failed to fetch versions from the CPO');
            }
            logger.debug(`🟢 [${reqId}] Fetched CPO versions in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            // Fetch version details from the CPO
            logger.debug(`🟡 [${reqId}] Fetching CPO version details in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, partner_id: partner.id } 
            });
            const cpoVersionDetailsReq = {
                ...req,
                body: {
                    partner_id: partner.id,
                },
                headers: {
                    ...req.headers,
                    'x-correlation-id': correlationId,
                    'X-Correlation-Id': correlationId,
                    'x-request-id': requestId,
                    'X-Request-Id': requestId,
                },
            } as unknown as Request;
            const cpoVersionDetails = await AdminVersionsModule.getCpoVersionDetails(cpoVersionDetailsReq);

            if (!(cpoVersionDetails.payload.data as unknown as { success: boolean })?.success) {
                logger.warn(`🟡 [${reqId}] Failed to fetch CPO version details in registerCpoFromCredentialsPayload`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('Failed to fetch version details from the CPO');
            }
            logger.debug(`🟢 [${reqId}] Fetched CPO version details in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            logger.debug(`🟡 [${reqId}] Fetching EMSP endpoints in registerCpoFromCredentialsPayload`, { 
                data: { ...logData, emsp_partner_id: emspPartner.id } 
            });
            const emspEndpoints = await databaseService.prisma.oCPIPartnerEndpoint.findMany({
                where: { partner_id: emspPartner.id },
                select: { module: true, role: true, url: true },
            });

            logger.debug(`🟢 [${reqId}] Returning registerCpoFromCredentialsPayload response`, { 
                data: { ...logData, emsp_endpoints_count: emspEndpoints.length } 
            });

            return OCPIResponseService.success({
                data: {
                    cpo_partner: partner,
                    cpo_credentials: credentials,
                    cpo_version_details: cpoVersionDetails.payload.data as unknown as OCPIVersionDetailResponse,
                    cpo_versions: cpoVersions.payload.data as unknown as OCPIVersionClass[],
                    emsp_partner: emspPartner,
                    emsp_endpoints: emspEndpoints,
                    emsp_versions_url: credentials.emsp_url,
                },
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            } as AdminResponsePayload<any>);
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in registerCpoFromCredentialsPayload: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}
