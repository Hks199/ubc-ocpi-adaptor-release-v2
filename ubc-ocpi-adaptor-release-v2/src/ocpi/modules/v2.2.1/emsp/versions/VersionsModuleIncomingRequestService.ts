import { Request, Response } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { AppError } from '../../../../../utils/errors';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPIInterfaceRole, OCPIModuleID, OCPIVersionNumber } from '../../../../schema/modules/verisons/enums';
import { OCPIEndpointClass, OCPIv211EndpointClass, OCPIVersionClass } from '../../../../schema/modules/verisons/types';
import { OCPIv211VersionDetailResponse, OCPIVersionDetailResponse } from '../../../../schema/modules/verisons/types/responses';
import Utils from '../../../../../utils/Utils';
import { databaseService } from '../../../../../services/database.service';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import { OCPIPartnerCredentials } from '@prisma/client';
import { logger } from '../../../../../services/logger.service';

/**
 * OCPI Versions module (incoming, EMSP side, v2.2.1).
 *
 * File name and path follow the existing convention:
 *   src/ocpi/modules/v2.2.1/emsp/versions/VersionsModuleIncomingRequestService.ts
 */
export default class VersionsModuleIncomingRequestService {

    public static async handleGetVersions(
        req: Request,
        res: Response,
        partnerCredentials?: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIVersionClass[]>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /versions', partnerId: partnerCredentials?.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /versions in handleGetVersions`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials?.partner_id,
                command: OCPILogCommand.GetVersionReq,
            });

            logger.debug(`🟡 [${reqId}] Finding EMSP partner in handleGetVersions`, { data: logData });
            const emspPartner = await Utils.findEmspPartner();

            if (!emspPartner) {
                logger.warn(`🟡 [${reqId}] EMSP partner not found in handleGetVersions`, { data: logData });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        status_message: 'EMSP partner not found',
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials?.partner_id,
                    command: OCPILogCommand.GetVersionRes,
                });

                logger.debug(`🟢 [${reqId}] Returning 404 response in handleGetVersions`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }

            logger.debug(`🟢 [${reqId}] Found EMSP partner in handleGetVersions`, { 
                data: { ...logData, emspPartnerId: emspPartner.id } 
            });

            logger.debug(`🟡 [${reqId}] Fetching OCPI versions from database in handleGetVersions`, { 
                data: { ...logData, partnerId: emspPartner.id } 
            });
            const ocpiVersions = await databaseService.prisma.oCPIVersion.findMany({
                where: {
                    partner_id: emspPartner.id,
                    deleted: false,
                },
                orderBy: {
                    created_at: 'desc',
                },
            });

            logger.debug(`🟢 [${reqId}] Fetched ${ocpiVersions.length} OCPI versions from database in handleGetVersions`, { 
                data: { ...logData, versionCount: ocpiVersions.length } 
            });

            logger.debug(`🟡 [${reqId}] Mapping OCPI versions to response format in handleGetVersions`, { 
                data: { ...logData, ocpiVersions } 
            });
            const versions: OCPIVersionClass[] = ocpiVersions.map((v) => ({
                version: v.version_id as OCPIVersionNumber,
                url: v.version_url,
            }));

            const response = {
                httpStatus: 200,
                payload: {
                    data: versions,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response
            await OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials?.partner_id,
                command: OCPILogCommand.GetVersionRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /versions response in handleGetVersions`, { 
                data: { ...logData, versionCount: versions.length, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetVersions: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    public static async handleGetVersionDetails(
        req: Request,
        res: Response,
        partnerCredentials?: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIVersionDetailResponse | OCPIv211VersionDetailResponse>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /version-details', partnerId: partnerCredentials?.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /version-details in handleGetVersionDetails`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials?.partner_id,
                command: OCPILogCommand.GetVersionDetailsReq,
            });

            // For this EMSP implementation we currently only support 2.2.1 and the
            // interface is mounted at /ocpi/emsp/2.2.1, so this handler always
            // returns the 2.2.1 version details.
            logger.debug(`🟡 [${reqId}] Fetching version details for 2.2.1 in handleGetVersionDetails`, { data: logData });
            const versionDetails = await VersionsModuleIncomingRequestService.handleGetVersionDetailsV221();
            
            logger.debug(`🟢 [${reqId}] Fetched version details in handleGetVersionDetails`, { 
                data: { ...logData, versionDetails } 
            });

            const response = {
                httpStatus: 200,
                payload: {
                    data: versionDetails,
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response
            await OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials?.partner_id,
                command: OCPILogCommand.GetVersionDetailsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /version-details response in handleGetVersionDetails`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetVersionDetails: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    private static async handleGetVersionDetailsV221(): Promise<OCPIVersionDetailResponse> {
        const reqId = 'internal';
        const logData = { action: 'handleGetVersionDetailsV221', version: OCPIVersionNumber.v2_2_1 };

        try {
            logger.debug(`🟡 [${reqId}] Starting handleGetVersionDetailsV221`, { data: logData });

            logger.debug(`🟡 [${reqId}] Finding EMSP partner in handleGetVersionDetailsV221`, { data: logData });
            const emspPartner = await Utils.findEmspPartner();

            if (!emspPartner) {
                logger.warn(`🟡 [${reqId}] EMSP partner not found in handleGetVersionDetailsV221`, { data: logData });
                throw new AppError('EMSP partner not found', 404);
            }

            logger.debug(`🟢 [${reqId}] Found EMSP partner in handleGetVersionDetailsV221`, { 
                data: { ...logData, emspPartnerId: emspPartner.id } 
            });

            logger.debug(`🟡 [${reqId}] Fetching OCPI partner endpoints from database in handleGetVersionDetailsV221`, { 
                data: { ...logData, partnerId: emspPartner.id, version: OCPIVersionNumber.v2_2_1 } 
            });
            const ocpiPartnerEndpoints = await databaseService.prisma.oCPIPartnerEndpoint.findMany({
                where: {
                    partner_id: emspPartner.id,
                    version: OCPIVersionNumber.v2_2_1,
                    deleted: false,
                },
            });

            logger.debug(`🟢 [${reqId}] Fetched ${ocpiPartnerEndpoints.length} OCPI partner endpoints from database in handleGetVersionDetailsV221`, { 
                data: { ...logData, endpointCount: ocpiPartnerEndpoints.length, ocpiPartnerEndpoints } 
            });

            logger.debug(`🟡 [${reqId}] Mapping OCPI partner endpoints to response format in handleGetVersionDetailsV221`, { 
                data: { ...logData, ocpiPartnerEndpoints } 
            });
            const endpoints: OCPIEndpointClass[] = ocpiPartnerEndpoints.map((e) => ({
                identifier: e.module as OCPIModuleID,
                role: e.role as OCPIInterfaceRole,
                url: e.url,
            }));

            const versionDetailResponse: OCPIVersionDetailResponse = {
                version: OCPIVersionNumber.v2_2_1,
                endpoints,
            };

            logger.debug(`🟢 [${reqId}] Returning version details response in handleGetVersionDetailsV221`, { 
                data: { ...logData, endpointCount: endpoints.length, versionDetailResponse } 
            });

            return versionDetailResponse;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetVersionDetailsV221: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    private static handleGetVersionDetailsV211(): OCPIv211VersionDetailResponse {
        const reqId = 'internal';
        const logData = { action: 'handleGetVersionDetailsV211', version: OCPIVersionNumber.v2_1_1 };

        try {
            logger.debug(`🟡 [${reqId}] Starting handleGetVersionDetailsV211`, { data: logData });

            const baseUrl = `${process.env.OCPI_HOST || 'https://nearly-boss-pheasant.ngrok-free.app'}/ocpi/${OCPIVersionNumber.v2_1_1}`;
            logger.debug(`🟡 [${reqId}] Building base URL for v2.1.1 in handleGetVersionDetailsV211`, { 
                data: { ...logData, baseUrl } 
            });

            logger.debug(`🟡 [${reqId}] Building endpoints array for v2.1.1 in handleGetVersionDetailsV211`, { data: logData });
            const endpoints: OCPIv211EndpointClass[] = [
                {
                    identifier: OCPIModuleID.CredentialsAndRegistration,
                    url: `${baseUrl}/${OCPIModuleID.CredentialsAndRegistration}`,
                },
                {
                    identifier: OCPIModuleID.CredentialsAndRegistration,
                    url: `${baseUrl}/${OCPIModuleID.CredentialsAndRegistration}`,
                },
                {
                    identifier: OCPIModuleID.Locations,
                    url: `${baseUrl}/${OCPIModuleID.Locations}`,
                },
                {
                    identifier: OCPIModuleID.Tariffs,
                    url: `${baseUrl}/${OCPIModuleID.Tariffs}`,
                },
                {
                    identifier: OCPIModuleID.Sessions,
                    url: `${baseUrl}/${OCPIModuleID.Sessions}`,
                },
                {
                    identifier: OCPIModuleID.Commands,
                    url: `${baseUrl}/${OCPIModuleID.Commands}`,
                },
                {
                    identifier: OCPIModuleID.Tokens,
                    url: `${baseUrl}/${OCPIModuleID.Tokens}`,
                },
            ];

            const versionDetailResponse: OCPIv211VersionDetailResponse = {
                version: OCPIVersionNumber.v2_1_1,
                endpoints,
            };

            logger.debug(`🟢 [${reqId}] Returning version details response for v2.1.1 in handleGetVersionDetailsV211`, { 
                data: { ...logData, endpointCount: endpoints.length, versionDetailResponse } 
            });

            return versionDetailResponse;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetVersionDetailsV211: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}