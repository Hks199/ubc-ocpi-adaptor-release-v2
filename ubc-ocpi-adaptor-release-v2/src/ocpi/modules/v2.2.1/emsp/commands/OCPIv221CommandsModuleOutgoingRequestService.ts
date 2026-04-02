import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICommandResponseResponse } from '../../../../schema/modules/commands/types/responses';
import {
    OCPICancelReservation,
    OCPIReserveNow,
    OCPIStartSession,
    OCPIStopSession,
    OCPIUnlockConnector,
} from '../../../../schema/modules/commands/types/requests';
import { OCPICommandType } from '../../../../schema/modules/commands/enums';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPILogCommand } from '../../../../types';
import { logger } from '../../../../../services/logger.service';

/**
 * OCPI 2.2.1 – Commands module (outgoing, EMSP → CPO).
 *
 * Uses the CPO Commands endpoint (identifier 'commands', role 'RECEIVER') from Utils.getAllEndpoints():
 *   - POST /commands/RESERVE_NOW
 *   - POST /commands/START_SESSION
 *   - POST /commands/STOP_SESSION
 *   - POST /commands/UNLOCK_CONNECTOR
 *   - POST /commands/CANCEL_RESERVATION
 *
 * Request bodies are exactly the OCPI 2.2.1 command request objects.
 * Responses are OCPICommandResponse wrapped in the standard OCPI envelope.
 */
export default class OCPIv221CommandsModuleOutgoingRequestService {
    private static async getCpoCommandsBaseUrl(partnerId?: string): Promise<string> {
        return Utils.getOcpiEndpoint('commands', 'RECEIVER', partnerId);
    }

    private static getAuthHeaders(
        cpoAuthToken: string,
        headers?: Record<string, string>,
    ): Record<string, string> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required to send OCPI command');
        }

        const requestHeaders: Record<string, string> = {
            Authorization: `Token ${cpoAuthToken}`,
            ...(headers?.['X-Correlation-Id'] && { 'X-Correlation-Id': headers['X-Correlation-Id'] }),
            ...(headers?.['x-correlation-id'] && { 'X-Correlation-Id': headers['x-correlation-id'] }),
            ...(headers?.['X-Request-Id'] && { 'X-Request-Id': headers['X-Request-Id'] }),
            ...(headers?.['x-request-id'] && { 'X-Request-Id': headers['x-request-id'] }),
        };
        return requestHeaders;
    }

    private static getLogCommandForCommandType(commandType: OCPICommandType): { requestCommand: OCPILogCommand; responseCommand: OCPILogCommand } {
        switch (commandType) {
            case OCPICommandType.START_SESSION:
                return {
                    requestCommand: OCPILogCommand.SendStartSessionPostCommandReq,
                    responseCommand: OCPILogCommand.SendStartSessionPostCommandRes,
                };
            case OCPICommandType.STOP_SESSION:
                return {
                    requestCommand: OCPILogCommand.SendStopSessionPostCommandReq,
                    responseCommand: OCPILogCommand.SendStopSessionPostCommandRes,
                };
            case OCPICommandType.RESERVE_NOW:
                return {
                    requestCommand: OCPILogCommand.PostStartSessionCommand,
                    responseCommand: OCPILogCommand.PostStartSessionCommand,
                };
            case OCPICommandType.CANCEL_RESERVATION:
                return {
                    requestCommand: OCPILogCommand.PostStopSessionCommand,
                    responseCommand: OCPILogCommand.PostStopSessionCommand,
                };
            case OCPICommandType.UNLOCK_CONNECTOR:
                return {
                    requestCommand: OCPILogCommand.PostStartSessionCommand,
                    responseCommand: OCPILogCommand.PostStartSessionCommand,
                };
            default:
                return {
                    requestCommand: OCPILogCommand.PostStartSessionCommand,
                    responseCommand: OCPILogCommand.PostStartSessionCommand,
                };
        }
    }

    private static async sendCommand(
        commandType: OCPICommandType,
        body: OCPICancelReservation | OCPIReserveNow | OCPIStartSession | OCPIStopSession | OCPIUnlockConnector,
        cpoAuthToken: string,
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const reqId = headers?.['x-correlation-id'] || headers?.['X-Correlation-Id'] || headers?.['x-request-id'] || headers?.['X-Request-Id'] || `outgoing-${Date.now()}`;
        const logData = { action: 'sendCommand', commandType, partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendCommand in OCPIv221CommandsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO commands base URL in sendCommand`, { data: logData });
            const baseUrl = await OCPIv221CommandsModuleOutgoingRequestService.getCpoCommandsBaseUrl(
                partnerId,
            );
            const url = `${baseUrl}/${commandType}`;

            const { requestCommand, responseCommand } = OCPIv221CommandsModuleOutgoingRequestService.getLogCommandForCommandType(commandType);

            // Extract IDs from command body for logging
            const logParams: any = {};
            if ('location_id' in body) {
                logParams.ocpi_location_id = body.location_id;
            }
            if ('evse_uid' in body) {
                logParams.ocpi_evse_uid = body.evse_uid;
            }
            if ('connector_id' in body) {
                logParams.ocpi_connector_id = body.connector_id;
            }
            if ('authorization_reference' in body) {
                logParams.authorization_reference = body.authorization_reference;
            }
            if ('session_id' in body) {
                logParams.cpo_session_id = body.session_id;
            }

            logger.debug(`🟡 [${reqId}] Sending POST command request to CPO in sendCommand`, { 
                data: { ...logData, url, logParams } 
            });
            const response = await OCPIOutgoingRequestService.sendPostRequest({
                url,
                headers: OCPIv221CommandsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken, headers),
                data: body,
                partnerId,
                requestCommand,
                responseCommand,
                logParams,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO command in sendCommand`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payload = response as OCPICommandResponseResponse;

            logger.debug(`🟢 [${reqId}] Returning sendCommand response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendCommand: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Convenience helpers for individual commands
     */
    public static async sendStartSessionCommand(
        body: OCPIStartSession,
        cpoAuthToken: string,
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.START_SESSION,
            body,
            cpoAuthToken,
            partnerId,
            headers,
        );
    }

    public static async sendStopSessionCommand(
        body: OCPIStopSession,
        cpoAuthToken: string,
        partnerId?: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.STOP_SESSION,
            body,
            cpoAuthToken,
            partnerId,
            headers,
        );
    }

    public static async sendReserveNowCommand(
        body: OCPIReserveNow,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.RESERVE_NOW,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    public static async sendCancelReservationCommand(
        body: OCPICancelReservation,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.CANCEL_RESERVATION,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    public static async sendUnlockConnectorCommand(
        body: OCPIUnlockConnector,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.UNLOCK_CONNECTOR,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    /**
     * Generic variant that can be used with an Express Request:
     * expects :command_type in params and the raw OCPI command body in req.body.
     */
    
    public static async sendPostCommand(
        req: Request,
        cpoAuthToken: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPostCommand' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPostCommand in OCPIv221CommandsModuleOutgoingRequestService`, { data: logData });

            const { command_type } = req.params as { command_type?: string };
            if (!command_type || !(command_type in OCPICommandType)) {
                logger.error(`🔴 [${reqId}] Invalid or missing command_type in sendPostCommand`, undefined, { 
                    data: { ...logData, command_type } 
                });
                throw new Error('Invalid or missing command_type path parameter');
            }

            const type = OCPICommandType[command_type as keyof typeof OCPICommandType];
            const body = req.body as
                | OCPICancelReservation
                | OCPIReserveNow
                | OCPIStartSession
                | OCPIStopSession
                | OCPIUnlockConnector;

            logger.debug(`🟡 [${reqId}] Calling sendCommand in sendPostCommand`, { 
                data: { ...logData, command_type, commandType: type } 
            });

            return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
                type,
                body,
                cpoAuthToken,
            );
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPostCommand: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}
