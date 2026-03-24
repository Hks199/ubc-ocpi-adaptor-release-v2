import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import {
    OCPIVersionClass,
} from '../../../../schema/modules/verisons/types';
import {
    OCPIv211VersionDetailResponse,
    OCPIVersionDetailResponse,
} from '../../../../schema/modules/verisons/types/responses';
import { OCPILogCommand } from '../../../../types';
import { logger } from '../../../../../services/logger.service';

type VersionDetailUnion = OCPIVersionDetailResponse | OCPIv211VersionDetailResponse;

/**
 * OCPI 2.2.1 – Versions module (outgoing, EMSP → CPO).
 *
 * This service is responsible only for talking to the CPO versions endpoints.
 * It does not touch the database or admin-specific logic.
 */
export default class OCPIv221VersionsModuleOutgoingRequestService {
    /**
     * Call the CPO /versions endpoint for a given partner.
     *
     * @param versionsUrl Full URL of the CPO /versions endpoint (from OCPIPartner.versions_url)
     * @param cpoAuthToken Token the CPO expects from this EMSP
     */
    public static async getVersions(
        versionsUrl: string,
        cpoAuthToken: string,
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<OCPIVersionClass[]> {
        const reqId = headers?.['x-correlation-id'] || headers?.['X-Correlation-Id'] || headers?.['x-request-id'] || headers?.['X-Request-Id'] || `outgoing-${Date.now()}`;
        const logData = { action: 'getVersions', partnerId, versionsUrl };

        try {
            logger.debug(`🟡 [${reqId}] Starting getVersions in OCPIv221VersionsModuleOutgoingRequestService`, { data: logData });

            if (!cpoAuthToken) {
                logger.error(`🔴 [${reqId}] CPO auth token is required in getVersions`, undefined, { data: logData });
                throw new Error('CPO auth token is required');
            }

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /versions endpoint in getVersions`, { 
                data: { ...logData, versionsUrl } 
            });

            const requestHeaders: Record<string, string> = {
                Authorization: `Token ${cpoAuthToken}`,
                ...(headers?.['X-Correlation-Id'] && { 'X-Correlation-Id': headers['X-Correlation-Id'] }),
                ...(headers?.['x-correlation-id'] && { 'X-Correlation-Id': headers['x-correlation-id'] }),
                ...(headers?.['X-Request-Id'] && { 'X-Request-Id': headers['X-Request-Id'] }),
                ...(headers?.['x-request-id'] && { 'X-Request-Id': headers['x-request-id'] }),
            };

            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url: versionsUrl,
                headers: requestHeaders,
                partnerId,
                requestCommand: OCPILogCommand.SendGetVersionReq,
                responseCommand: OCPILogCommand.SendGetVersionRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /versions endpoint in getVersions`, { 
                data: { ...logData, responseData: response.data } 
            });

            const payload = response.data as {
                data?: OCPIVersionClass[];
                versions?: OCPIVersionClass[];
                status_code?: number;
            };

            logger.debug(`🟡 [${reqId}] Parsing response payload in getVersions`, { 
                data: { ...logData, payload } 
            });

            const versions: OCPIVersionClass[] | undefined =
                payload.data ?? payload.versions;

            if (!versions || !Array.isArray(versions)) {
                logger.error(`🔴 [${reqId}] Invalid response format from CPO /versions endpoint in getVersions`, undefined, { 
                    data: { ...logData, payload, versions } 
                });
                throw new Error('Invalid response format from CPO /versions endpoint');
            }

            logger.debug(`🟢 [${reqId}] Successfully parsed ${versions.length} versions from CPO in getVersions`, { 
                data: { ...logData, versionCount: versions.length, versions } 
            });

            return versions;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getVersions: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Call the CPO version-details endpoint for a specific version.
     *
     * @param versionUrl Full URL of the CPO version-details endpoint (from OCPIVersion.version_url)
     * @param cpoAuthToken Token the CPO expects from this EMSP
     * @param fallbackVersionId Optional version_id to use if CPO responds with only endpoints
     */
    public static async getVersionDetails(
        versionUrl: string,
        cpoAuthToken: string,
        fallbackVersionId?: string,
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<VersionDetailUnion> {
        const reqId = headers?.['x-correlation-id'] || headers?.['X-Correlation-Id'] || headers?.['x-request-id'] || headers?.['X-Request-Id'] || `outgoing-${Date.now()}`;
        const logData = { action: 'getVersionDetails', partnerId, versionUrl, fallbackVersionId };

        try {
            logger.debug(`🟡 [${reqId}] Starting getVersionDetails in OCPIv221VersionsModuleOutgoingRequestService`, { data: logData });

            if (!cpoAuthToken) {
                logger.error(`🔴 [${reqId}] CPO auth token is required in getVersionDetails`, undefined, { data: logData });
                throw new Error('CPO auth token is required');
            }

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO version-details endpoint in getVersionDetails`, { 
                data: { ...logData, versionUrl } 
            });

            const requestHeaders: Record<string, string> = {
                Authorization: `Token ${cpoAuthToken}`,
                ...(headers?.['X-Correlation-Id'] && { 'X-Correlation-Id': headers['X-Correlation-Id'] }),
                ...(headers?.['x-correlation-id'] && { 'X-Correlation-Id': headers['x-correlation-id'] }),
                ...(headers?.['X-Request-Id'] && { 'X-Request-Id': headers['X-Request-Id'] }),
                ...(headers?.['x-request-id'] && { 'X-Request-Id': headers['x-request-id'] }),
            };
            console.log("DB version URL:", versionUrl);
            console.log("Using fallback:", fallbackVersionId);
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url: versionUrl,
                headers: requestHeaders,
                partnerId,
                requestCommand: OCPILogCommand.SendGetVersionDetailsReq,
                responseCommand: OCPILogCommand.SendGetVersionDetailsRes,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO version-details endpoint in getVersionDetails`, { 
                data: { ...logData, responseData: response.data } 
            });

            const payload = response.data as {
                data?: VersionDetailUnion;
                endpoints?: VersionDetailUnion['endpoints'];
            };

            logger.debug(`🟡 [${reqId}] Parsing response payload in getVersionDetails`, { 
                data: { ...logData, payload } 
            });

            if (payload.data) {
                logger.debug(`🟢 [${reqId}] Returning payload.data from CPO response in getVersionDetails`, { 
                    data: { ...logData, versionDetails: payload.data } 
                });
                return payload.data;
            }

            const endpoints = payload.endpoints ?? [];
            logger.debug(`🟡 [${reqId}] Building version details response with fallback version ID in getVersionDetails`, { 
                data: { ...logData, endpointCount: endpoints.length, fallbackVersionId } 
            });

            const versionDetailResponse: VersionDetailUnion = {
                version: (fallbackVersionId ?? '') as any,
                endpoints,
            };

            logger.debug(`🟢 [${reqId}] Returning version details response in getVersionDetails`, { 
                data: { ...logData, versionDetailResponse } 
            });

            return versionDetailResponse;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getVersionDetails: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}
