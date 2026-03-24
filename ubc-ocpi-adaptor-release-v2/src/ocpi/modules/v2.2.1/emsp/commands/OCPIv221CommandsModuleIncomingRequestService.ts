import { Request, Response } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICommandResponseResponse } from '../../../../schema/modules/commands/types/responses';
import { OCPICommandResult } from '../../../../schema/modules/commands/types/requests';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { logger } from '../../../../../services/logger.service';
import { databaseService } from '../../../../../services/database.service';
import { OCPIPartnerCredentials, Session } from '@prisma/client';
import { OCPISessionStatus } from '../../../../schema/modules/sessions/enums';
import { OCPICommandResultType, OCPICommandType } from '../../../../schema/modules/commands/enums';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import Utils from '../../../../../utils/Utils';
import PublishActionService from '../../../../../ubc/actions/services/PublishActionService';
import { TariffDbService } from '../../../../../db-services/TariffDbService';
import PaymentTxnDbService from '../../../../../db-services/PaymentTxnDbService';
import { ChargingSessionStatus } from '../../../../../ubc/schema/v2.0.0/enums/ChargingSessionStatus';
import { OrderStatus } from '../../../../../ubc/schema/v2.0.0/enums/OrderStatus';
import { UBCOnUpdateRequestPayload } from '../../../../../ubc/schema/v2.0.0/actions/update/types/OnUpdatePayload';
import BppOnixRequestService from '../../../../../ubc/services/BppOnixRequestService';
import { BecknAction } from '../../../../../ubc/schema/v2.0.0/enums/BecknAction';
import { BecknDomain } from '../../../../../ubc/schema/v2.0.0/enums/BecknDomain';
import { EvseDbService } from '../../../../../db-services/EvseDbService';

/**
 * OCPI 2.2.1 – Commands module (incoming, EMSP side).
 *
 * CPO calls the EMSP's response_url with a CommandResult object:
 *   - Body: OCPICommandResult
 *
 * We accept the result, log it, and answer with a standard OCPI envelope.
 */
export default class OCPIv221CommandsModuleIncomingRequestService {
    /**
     * POST /commands/{command_type}/{command_id}
     *
     * This endpoint is used as the response_url for asynchronous command results.
     */
    public static async handlePostCommand(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'POST /commands/:command_type/:command_id', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting POST /commands/:command_type/:command_id in handlePostCommand`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostCommandResultReq,
            });

            const { command_type, command_id } = req.params as {
                command_type?: string;
                command_id?: string;
            };
            

            const result = req.body as OCPICommandResult | undefined;

            logger.debug(`🟡 [${reqId}] Parsing command result in handlePostCommand`, { 
                data: { ...logData, command_type, command_id, result } 
            });

            logger.info('Received OCPI command result from CPO', {
                command_type,
                command_id,
                result,
            });

            let status = OCPISessionStatus.ACTIVE;
            let session = null;

            if (command_type === OCPICommandType.START_SESSION) {
                logger.debug(`🟡 [${reqId}] Processing START_SESSION command in handlePostCommand`, { 
                    data: { ...logData, command_type, command_id } 
                });
                if (result?.result !== OCPICommandResultType.ACCEPTED) {
                    status = OCPISessionStatus.INVALID;
                }
                logger.debug(`🟡 [${reqId}] Finding session by authorization_reference in handlePostCommand`, { 
                    data: { ...logData, authorization_reference: command_id } 
                });
                session = await databaseService.prisma.session.findFirst({
                    where: {
                        authorization_reference: command_id,
                    },
                });
            } 
            else if (command_type === OCPICommandType.STOP_SESSION) {
                logger.debug(`🟡 [${reqId}] Processing STOP_SESSION command in handlePostCommand`, { 
                    data: { ...logData, command_type, command_id } 
                });
                if (result?.result == OCPICommandResultType.ACCEPTED) {
                    status = OCPISessionStatus.COMPLETED;
                }
                logger.debug(`🟡 [${reqId}] Finding session by cpo_session_id in handlePostCommand`, { 
                    data: { ...logData, cpo_session_id: command_id } 
                });
                session = await databaseService.prisma.session.findFirst({
                    where: {
                        cpo_session_id: command_id,
                    },
                });
            }

            if (!session) {
                logger.warn(`🟡 [${reqId}] Session not found for command in handlePostCommand`, { 
                    data: { ...logData, command_type, command_id } 
                });
                const response = {
                    httpStatus: 404,
                    payload: {
                        status_code: OCPIResponseStatusCode.status_2001,
                        timestamp: new Date().toISOString(),
                    },
                };

                // Log outgoing response (non-blocking)
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PostCommandResultRes,
                });

                logger.debug(`🟢 [${reqId}] Returning 404 response in handlePostCommand`, { 
                    data: { ...logData, response: response.payload } 
                });

                return response;
            }
            
            logger.debug(`🟡 [${reqId}] Updating session status in handlePostCommand`, { 
                data: { ...logData, sessionId: session.id, status } 
            });
            // update the session status
            await databaseService.prisma.session.update({
                where: { id: session?.id },
                data: {
                    status,
                },
            });

            logger.debug(`🟢 [${reqId}] Updated session status in handlePostCommand`, { 
                data: { ...logData, sessionId: session.id, status } 
            });

            // Handle publish and on_update logic based on command type and result
            if (command_type === OCPICommandType.START_SESSION) {
                if (result?.result === OCPICommandResultType.ACCEPTED) {
                    // Accepted: publish with reservation and send on_update async with ACTIVE status
                    Utils.executeAsync(async () => {
                        try {
                            await OCPIv221CommandsModuleIncomingRequestService.handleStartChargingAccepted(
                                session,
                                reqId
                            );
                        }
                        catch (e: any) {
                            logger.error(`🔴 [${reqId}] Error handling start charging accepted: ${e?.toString()}`, e);
                        }
                    });
                }
                else {
                    // Rejected: send on_update async with INTERRUPTED status, don't publish
                    Utils.executeAsync(async () => {
                        try {
                            await OCPIv221CommandsModuleIncomingRequestService.sendOnUpdateWithStatus(
                                session,
                                ChargingSessionStatus.INTERRUPTED,
                                reqId
                            );
                        }
                        catch (e: any) {
                            logger.error(`🔴 [${reqId}] Error sending on_update with INTERRUPTED status: ${e?.toString()}`, e);
                        }
                    });
                }
            }

            const response = {
                httpStatus: 200,
                payload: {
                    status_code: OCPIResponseStatusCode.status_1000,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostCommandResultRes,
            });

            logger.debug(`🟢 [${reqId}] Returning POST /commands response in handlePostCommand`, { 
                data: { ...logData, response: response.payload } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePostCommand: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Handles start charging accepted: publishes catalog with reservation time and sends on_update with ACTIVE status
     */
    private static async handleStartChargingAccepted(
        session: Session,
        reqId: string
    ): Promise<void> {
        if (!session?.authorization_reference) {
            logger.warn(`🟡 [${reqId}] Session missing authorization_reference for start charging accepted`);
            return;
        }

        // Get payment transaction to get estimated cost and beckn_transaction_id
        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                authorization_reference: session.authorization_reference,
            },
        });

        if (!paymentTxn) {
            logger.warn(`🟡 [${reqId}] Payment txn not found for start charging: ${session.authorization_reference}`);
            return;
        }

        // Get location to get ocpi_location_id
        if (!session.location_id || !session.evse_uid || !session.connector_id) {
            logger.warn(`🟡 [${reqId}] Session missing location_id for start charging: ${session.id}`);
            return;
        }

        // Find EVSE and connector to get power rating and tariff
        const evse = await EvseDbService.getByEvseUId(session.evse_uid, {
            include: {
                evse_connectors: true,
            },
        });
        if (!evse) {
            logger.warn(`🟡 [${reqId}] EVSE not found for start charging: ${session.evse_uid}`);
            return;
        }

        const evseConnector = evse?.evse_connectors?.find(
            connector => connector.connector_id === session.connector_id && !connector.deleted
        );

        if (!evseConnector) {
            logger.warn(`🟡 [${reqId}] EVSE Connector not found for start charging: ${session.connector_id}`);
            return;
        }

        // Calculate reservation time based on estimated cost, power rating, and tariff rate
        const estimatedCost = Number(paymentTxn.amount);
        const powerRating = evseConnector.max_electric_power ? Number(evseConnector.max_electric_power) / 1000 : 0; // Convert W to kW

        // Get tariff rate from connector's first tariff
        let tariffRate = 0;
        if (evseConnector.tariff_ids && evseConnector.tariff_ids.length > 0) {
            const tariff = await TariffDbService.getByOcpiTariffId(evseConnector.tariff_ids[0]);
            if (tariff) {
                const ocpiTariff = TariffDbService.mapPrismaTariffToOcpi(tariff);
                const tariffElements = ocpiTariff.elements || [];
                if (tariffElements.length > 0 && tariffElements[0].price_components && tariffElements[0].price_components.length > 0) {
                    tariffRate = tariffElements[0].price_components[0].price || 0;
                }
            }
        }

        const reservationTime = PublishActionService.calculateReservationTimeForStartCharging({
            estimatedCost,
            powerRating,
            tariffRate,
        });

        // Send on_update with ACTIVE status
        await OCPIv221CommandsModuleIncomingRequestService.sendOnUpdateWithStatus(
            session,
            ChargingSessionStatus.ACTIVE,
            reqId,
        );

        // Publish catalog with reservation using OCPI connector_id
        await PublishActionService.publishWithReservation(
            session.connector_id,
            reservationTime
        );
        
    }

    /**
     * Handles stop charging accepted: publishes catalog without reservation and sends on_update with COMPLETED status
     */
    private static async handleStopChargingAccepted(
        session: any,
        reqId: string
    ): Promise<void> {
        if (!session?.location_id || !session?.evse_uid || !session?.connector_id) {
            logger.warn(`🟡 [${reqId}] Session missing required fields for stop charging: ${session?.id}`);
            return;
        }

        // Publish with no reservation (undefined) to restore normal availability
        await PublishActionService.publishWithReservation(
            session.connector_id,
            undefined
        );

        // Send on_update with COMPLETED status
        await OCPIv221CommandsModuleIncomingRequestService.sendOnUpdateWithStatus(
            session,
            ChargingSessionStatus.COMPLETED,
            reqId
        );
    }

    /**
     * Sends on_update async with the specified session status
     * First time: Uses the update request log (since on_update hasn't been sent yet)
     * After that: Uses the existing on_update response
     */
    private static async sendOnUpdateWithStatus(
        session: Session,
        sessionStatus: ChargingSessionStatus,
        reqId: string
    ): Promise<void> {
        if (!session?.authorization_reference) {
            logger.warn(`🟡 [${reqId}] Session missing authorization_reference for on_update: ${session?.id}`);
            return;
        }

        // Get payment transaction to get beckn_transaction_id
        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                authorization_reference: session.authorization_reference,
            },
        });

        if (!paymentTxn?.beckn_transaction_id) {
            logger.warn(`🟡 [${reqId}] Payment txn or beckn_transaction_id not found for on_update: ${session.authorization_reference}`);
            return;
        }

        // First try to fetch existing on_update response (for subsequent calls)
        let basePayload = await OCPIv221CommandsModuleIncomingRequestService.fetchExistingOnUpdateResponse(paymentTxn.beckn_transaction_id);
        
        // If no on_update exists yet, use the original update request (for first call)
        if (!basePayload) {
            logger.debug(`🟡 [${reqId}] No existing on_update found, fetching update request to generate first on_update`);
            basePayload = await OCPIv221CommandsModuleIncomingRequestService.fetchUpdateRequest(paymentTxn.beckn_transaction_id);
        }

        if (!basePayload) {
            logger.warn(`🟡 [${reqId}] No update request or on_update response found for transaction: ${paymentTxn.beckn_transaction_id}`);
            return;
        }

        // Build new on_update payload with updated status
        const order = basePayload.message.order;
        const fulfillment = order['beckn:fulfillment'];
        const deliveryAttributes = fulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown>;

        // Determine orderStatus based on session status
        let orderStatus: OrderStatus;
        if (sessionStatus === ChargingSessionStatus.ACTIVE) {
            orderStatus = OrderStatus.INPROGRESS;
        }
        else if (sessionStatus === ChargingSessionStatus.COMPLETED) {
            orderStatus = OrderStatus.COMPLETED;
        }
        else if (sessionStatus === ChargingSessionStatus.INTERRUPTED) {
            orderStatus = OrderStatus.CANCELLED;
        }
        else {
            orderStatus = order['beckn:orderStatus'] as OrderStatus;
        }

        // Update delivery attributes with new session status
        // Per schema: on_update must include connectorType, maxPowerKW, and sessionStatus
        const updatedDeliveryAttributes = {
            ...deliveryAttributes,
            "@context": (deliveryAttributes?.['@context'] as string) || "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingSession/v1/context.jsonld",
            "@type": "ChargingSession" as const,
            'sessionStatus': sessionStatus,
        };

        // Build on_update payload
        const context = Utils.getBPPContext({
            ...basePayload.context,
            action: BecknAction.on_update,
        });

        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": order['@context'],
                    "@type": order['@type'],
                    "beckn:id": order['beckn:id'],
                    'beckn:orderStatus': orderStatus,
                    "beckn:seller": order['beckn:seller'],
                    "beckn:buyer": order['beckn:buyer'],
                    "beckn:orderItems": order['beckn:orderItems'],
                    "beckn:orderValue": order['beckn:orderValue'],
                    "beckn:payment": order['beckn:payment'],
                    'beckn:fulfillment': {
                        ...fulfillment,
                        "@context": fulfillment?.['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                        "@type": fulfillment?.['@type'] || "beckn:Fulfillment",
                        "beckn:id": fulfillment?.['beckn:id'] || `fulfillment-${order['beckn:id']}`,
                        "beckn:mode": fulfillment?.['beckn:mode'] || "RESERVATION",
                        'beckn:deliveryAttributes': updatedDeliveryAttributes,
                    },
                },
            },
        };

        // Send on_update to Beckn ONIX
        const bppHost = Utils.getBPPClientHost();
        await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_update}`,
                data: ubcOnUpdatePayload,
            },
            BecknDomain.EVChargingUBC
        );

        logger.debug(`🟢 [${reqId}] Sent on_update with status ${sessionStatus}`, {
            data: { authorization_reference: session.authorization_reference, sessionStatus }
        });
    }

    /**
     * Fetches existing on_update response from beckn logs (for subsequent on_update calls)
     */
    private static async fetchExistingOnUpdateResponse(
        transactionId: string
    ): Promise<UBCOnUpdateRequestPayload | null> {
        const becknLogs = await databaseService.prisma.becknLog.findMany({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_update}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: 'desc',
            },
            take: 1,
        });

        if (becknLogs && becknLogs.length > 0) {
            return becknLogs[0].payload as UBCOnUpdateRequestPayload;
        }

        return null;
    }

    /**
     * Fetches the original update request from beckn logs (for first on_update generation)
     */
    private static async fetchUpdateRequest(
        transactionId: string
    ): Promise<UBCOnUpdateRequestPayload | null> {
        const becknLogs = await databaseService.prisma.becknLog.findMany({
            where: {
                transaction_id: transactionId,
                action: `bpp.in.request.${BecknAction.update}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: 'desc',
            },
            take: 1,
        });

        if (becknLogs && becknLogs.length > 0) {
            return becknLogs[0].payload as UBCOnUpdateRequestPayload;
        }

        return null;
    }
}
