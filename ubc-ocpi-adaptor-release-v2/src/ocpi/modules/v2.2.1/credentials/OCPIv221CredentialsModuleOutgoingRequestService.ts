import { HttpResponse } from '../../../../types/responses';
import { OCPIResponsePayload } from '../../../schema/general/types/responses';
import {
    OCPICredentials,
    OCPICredentialsRoleClass,
} from '../../../schema/modules/credentials/types';
import OCPIOutgoingRequestService from '../../../services/OCPIOutgoingRequestService';
import { OCPILogCommand } from '../../../types';

/**
 * OCPI 2.2.1 Credentials module (outgoing, EMSP side).
 *
 * Used when THIS EMSP needs to talk to a CPO's /credentials endpoint:
 *  - POST /credentials  (initial handshake or updates)
 *  - GET /credentials   (fetch current CPO view of credentials)
 *  - PATCH /credentials (update token / URL)
 */
export default class OCPIv221CredentialsModuleOutgoingRequestService {
    /**
     * POST /credentials to CPO.
     *
     * Takes token, url and roles directly and calls the CPO /credentials endpoint.
     * The OCPI payload on the wire is:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role }]
     * }
     */
    public static async sendPostCredentials(
        cpoAuthToken: string,
        cpoUrl: string,
        token: string,
        url: string,
        roles: OCPICredentialsRoleClass[],
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const reqId = headers?.['x-correlation-id'] || headers?.['X-Correlation-Id'] || headers?.['x-request-id'] || headers?.['X-Request-Id'] || `outgoing-${Date.now()}`;
        const credentials: OCPICredentials = {
            token,
            url,
            roles,
        };

        const requestHeaders: Record<string, string> = {
            Authorization: `Token ${cpoAuthToken}`,
            ...(headers?.['X-Correlation-Id'] && { 'X-Correlation-Id': headers['X-Correlation-Id'] }),
            ...(headers?.['x-correlation-id'] && { 'X-Correlation-Id': headers['x-correlation-id'] }),
            ...(headers?.['X-Request-Id'] && { 'X-Request-Id': headers['X-Request-Id'] }),
            ...(headers?.['x-request-id'] && { 'X-Request-Id': headers['x-request-id'] }),
        };

        const response = await OCPIOutgoingRequestService.sendPostRequest({
            url: cpoUrl,
            headers: requestHeaders,
            data: credentials,
            partnerId,
            requestCommand: OCPILogCommand.SendPostCredentialsReq,
            responseCommand: OCPILogCommand.SendPostCredentialsRes,
        });

        const payload = response as OCPIResponsePayload<OCPICredentials>;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * GET /credentials from CPO.
     *
     * @param cpoUrl Full URL of the CPO /credentials endpoint
     * @param cpoAuthToken Token that should be used to call the CPO (typically the CPO-issued token)
     */
    public static async sendGetCredentials(
        cpoUrl: string,
        cpoAuthToken: string,
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const reqId = headers?.['x-correlation-id'] || headers?.['X-Correlation-Id'] || headers?.['x-request-id'] || headers?.['X-Request-Id'] || `outgoing-${Date.now()}`;
        const requestHeaders: Record<string, string> = {
            Authorization: `Token ${cpoAuthToken}`,
            ...(headers?.['X-Correlation-Id'] && { 'X-Correlation-Id': headers['X-Correlation-Id'] }),
            ...(headers?.['x-correlation-id'] && { 'X-Correlation-Id': headers['x-correlation-id'] }),
            ...(headers?.['X-Request-Id'] && { 'X-Request-Id': headers['X-Request-Id'] }),
            ...(headers?.['x-request-id'] && { 'X-Request-Id': headers['x-request-id'] }),
        };

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url: cpoUrl,
            headers: requestHeaders,
            partnerId,
            requestCommand: OCPILogCommand.SendGetCredentialsReq,
            responseCommand: OCPILogCommand.SendGetCredentialsRes,
        });

        const payload = response.data as OCPIResponsePayload<OCPICredentials>;

        return {
            httpStatus: 200,
            payload,
        };
    }


}
