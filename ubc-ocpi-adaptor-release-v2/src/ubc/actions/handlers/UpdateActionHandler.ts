import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { UBCUpdateRequestPayload } from '../../schema/v2.0.0/actions/update/types/UpdatePayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import OnixBppController from '../../controller/OnixBppController';
import BecknLogDbService from '../../../db-services/BecknLogDbService';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { Prisma } from '@prisma/client';
import Utils from '../../../utils/Utils';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { UBCOnUpdateRequestPayload } from '../../schema/v2.0.0/actions/update/types/OnUpdatePayload';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { ExtractedUpdateRequestBody } from '../../schema/v2.0.0/actions/update/types/ExtractedUpdateRequestPayload';
import { ExtractedOnUpdateResponsePayload } from '../../schema/v2.0.0/actions/update/types/ExtractedOnUpdateResponsePayload';
import { ChargingAction } from '../../schema/v2.0.0/enums/ChargingAction';
import AdminCommandsModule from '../../../admin/modules/AdminCommandsModule';
import { SessionDbService } from '../../../db-services/SessionDbService';
import { LocationDbService } from '../../../db-services/LocationDbService';
import { OCPICommandResponseResponse } from '../../../ocpi/schema/modules/commands/types/responses';
import { OCPICommandResponseType } from '../../../ocpi/schema/modules/commands/enums';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { mapGenericToBecknStatus } from '../../services/PaymentServices/Razorpay/RazorpayPaymentService';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps } from '../../../types/OCPIPartner';
import { CdrDbService } from '../../../db-services/CdrDbService';
import ChargingService from '../services/ChargingService';
import { randomUUID } from 'crypto';
import { GenericPaymentTxnStatus } from '../../../types/Payment';

// Tracks running synthetic session intervals keyed by session DB id.
// Allows manual stop to cancel the auto-complete timer and create a CDR immediately.
const syntheticSessionIntervals = new Map<string, {
    intervalHandle: ReturnType<typeof setInterval>;
    safetyHandle: ReturnType<typeof setTimeout>;
    triggerCompletion: (finalKwh: number) => Promise<void>;
    getCurrentKwh: () => number;
}>();

/**
 * Handler for update action
 */
export default class UpdateActionHandler {
    public static async handleBppUpdateAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCUpdateRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.update, req, () => {
            UpdateActionHandler.handleEVChargingUBCBppUpdateAction(payload)
                .then((ubcOnUpdateResponsePayload: UBCOnUpdateRequestPayload) => {
                    logger.debug(`🟢 Sending select response in handleBppSelectRequest`, {
                        data: ubcOnUpdateResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSelectRequest: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppUpdateAction(
        reqPayload: UBCUpdateRequestPayload
    ): Promise<UBCOnUpdateRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'update', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppUpdateAction`,
                { data: { logData, reqPayload } }
            );
            const backendUpdatePayload: ExtractedUpdateRequestBody =
                UpdateActionHandler.translateUBCToBackendPayload(reqPayload);

            // Fetch on_init response to get beneficiary
            const existingOnInitResponse = await UpdateActionHandler.fetchExistingBppOnInitResponse(reqPayload.context.transaction_id);
            const beneficiary = existingOnInitResponse?.message?.order?.['beckn:payment']?.['beckn:beneficiary'] as 'BPP' | 'BAP' | undefined || 'BPP';

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending update call to backend in handleEVChargingUBCBppUpdateAction`,
                { data: { backendUpdatePayload, beneficiary } }
            );
            const ExtractedOnUpdateResponseBody: ExtractedOnUpdateResponsePayload =
                await UpdateActionHandler.sendUpdateCallToBackend(backendUpdatePayload, beneficiary);
            logger.debug(
                `🟢 [${reqId}] Received update response from backend in handleEVChargingUBCBppUpdateAction`,
                { data: { ExtractedOnUpdateResponseBody } }
            );

            // Fetch existing status response to reuse payment (same as status)
            const existingOnStatusResponse = await UpdateActionHandler.fetchExistingBppOnStatusResponse(reqPayload.context.transaction_id);

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppUpdateAction`,
                { data: { reqPayload, ExtractedOnUpdateResponseBody } }
            );
            const ubcOnUpdatePayload: UBCOnUpdateRequestPayload =
                UpdateActionHandler.translateBackendToUBC(
                    reqPayload,
                    ExtractedOnUpdateResponseBody,
                    existingOnStatusResponse
                );

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_update call to Beckn ONIX in handleEVChargingUBCBppUpdateAction`,
                { data: { ubcOnUpdatePayload } }
            );
            const response =
                await UpdateActionHandler.sendOnUpdateCallToBecknONIX(ubcOnUpdatePayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_update call to Beckn ONIX in handleEVChargingUBCBppUpdateAction`,
                { data: { response } }
            );

            // return the response
            return ExtractedOnUpdateResponseBody as any;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppUpdateAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );

            // Send error response to BAP side so the stitched response can be resolved
            // This prevents the request from getting stuck in REQUESTS_STORE waiting for a callback
            try {
                await UpdateActionHandler.sendErrorOnUpdateResponse(reqPayload, e instanceof Error ? e : new Error(e?.toString() || 'Unknown error'));
            }
            catch (sendError: any) {
                logger.error(
                    `🔴 [${reqId}] Error sending error on_update response`,
                    sendError instanceof Error ? sendError : new Error(String(sendError)),
                    { data: { message: 'Failed to send error response' } }
                );
            }

            throw e;
        }
    }

    public static async fetchExistingBppOnUpdateResponse(
        transactionId: string
    ): Promise<UBCOnUpdateRequestPayload | null> {
        /**
         * If beckn transaction id is provided, check if the on update response for this transaction id is already present in the database.
         * if yes, return the response from the database. if no, then proceed to the next step.
         */
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.in.request.${BecknAction.update}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: Prisma.SortOrder.desc,
            },
            take: 1,
        });

        if (becknLogs?.records && becknLogs.records.length > 0) {
            return becknLogs.records[0].payload as UBCOnUpdateRequestPayload;
        }

        return null;
    }

    public static async fetchExistingBppOnStatusResponse(transactionId: string): Promise<any | null> {
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_status}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: Prisma.SortOrder.desc,
            },
            take: 1,
        });

        if (becknLogs?.records && becknLogs.records.length > 0) {
            return becknLogs.records[0].payload;
        }

        return null;
    }

    /**
     * Determines the charging action based on session status
     * Start charging: sessionStatus is "PENDING" (user wants to start the charging session)
     * Stop charging: sessionStatus is "STOP" (user wants to stop during an active session)
     */
    public static determineChargingAction(sessionStatus: string | ChargingSessionStatus): ChargingAction {
        if (sessionStatus === ChargingSessionStatus.PENDING) {
            return ChargingAction.StartCharging;
        }
        else if (sessionStatus === 'STOP') {
            return ChargingAction.StopCharging;
        }
        else {
            throw new Error(`Invalid sessionStatus for update action: ${sessionStatus}. Expected "PENDING" for start charging or "STOP" for stop charging.`);
        }
    }

    public static translateUBCToBackendPayload(
        payload: UBCUpdateRequestPayload
    ): ExtractedUpdateRequestBody {
        const deliveryAttributes = payload.message.order['beckn:fulfillment']['beckn:deliveryAttributes'] as Record<string, unknown>;
        const sessionStatus = deliveryAttributes?.sessionStatus as ChargingSessionStatus;

        const backendUpdatePayload: ExtractedUpdateRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id || '',
                bap_uri: payload.context.bap_uri || '',
            },
            payload: {
                charge_point_connector_id:
                    payload.message.order['beckn:orderItems'][0]['beckn:orderedItem'],
                beckn_order_id: payload.message.order['beckn:id'], // Use beckn:id instead of beckn:orderNumber
                charging_action: this.determineChargingAction(sessionStatus),
            },
        };
        return backendUpdatePayload;
    }

    public static async fetchExistingBppOnInitResponse(transactionId: string): Promise<any | null> {
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_init}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: Prisma.SortOrder.desc,
            },
            take: 1,
        });

        if (becknLogs?.records && becknLogs.records.length > 0) {
            return becknLogs.records[0].payload;
        }

        return null;
    }

    public static async sendUpdateCallToBackend(
        payload: ExtractedUpdateRequestBody,
        beneficiary: 'BPP' | 'BAP' = 'BPP'
    ): Promise<ExtractedOnUpdateResponsePayload> {
        const { beckn_order_id, charging_action, charge_point_connector_id } = payload.payload;

        let paymentTxn = null;
        
        // Only check payment status if beneficiary is BPP
        if (beneficiary === 'BPP') {
            paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    OR: [
                        { authorization_reference: beckn_order_id },
                        { beckn_transaction_id: beckn_order_id },
                    ],
                },
            });

            if (!paymentTxn) {
                throw new Error('Payment txn not found');
            }

            const paymentStatus = mapGenericToBecknStatus(paymentTxn.status);

            // Stop must work after UAT auto-refund / partial refund so OCPI STOP_SESSION can still run.
            // Start charging remains restricted to PENDING or COMPLETED only.
            const rawRefundedLike =
                paymentTxn.status === GenericPaymentTxnStatus.Refunded ||
                paymentTxn.status === GenericPaymentTxnStatus.PartiallyRefunded;
            const allowStopAfterRefundOrPartial =
                charging_action === ChargingAction.StopCharging &&
                (paymentStatus === BecknPaymentStatus.REFUNDED ||
                    paymentStatus === BecknPaymentStatus.PARTIALLY_REFUNDED ||
                    rawRefundedLike);

            if (
                paymentStatus !== BecknPaymentStatus.PENDING &&
                paymentStatus !== BecknPaymentStatus.COMPLETED &&
                !allowStopAfterRefundOrPartial
            ) {
                throw new Error(`Payment txn status '${paymentStatus}' is not valid for charging. Expected PENDING or COMPLETED.`);
            }
        }
        
        if (charging_action === ChargingAction.StartCharging) {
            
            // Fetch connector directly from DB using beckn_connector_id
            const connectorData = await LocationDbService.getConnectorByBecknId(charge_point_connector_id);
            
            if (!connectorData) {
                throw new Error(`Connector not found for: ${charge_point_connector_id}`);
            }

            const evseConnector = connectorData.connector;
            const evse = connectorData.evse;
            const location = connectorData.location;
    
            const req = {
                body: {
                    partner_id: evse.partner_id ?? '',
                    location_id: location.ocpi_location_id,
                    evse_uid: evse.uid,
                    connector_id: evseConnector.connector_id,
                    transaction_id: beckn_order_id,
                },
            } as Request;

            // Check if session already exists (update action can be called multiple times)
            let session = await SessionDbService.getByAuthorizationReference(beckn_order_id);
            if (session) {
                if(session.status !== ChargingSessionStatus.PENDING) {
                    throw new Error('Session is not in pending state');
                }
            }
            if (!session) {
                // Only create if it doesn't exist
                // For BAP beneficiary, requested_energy_units may not be available
                const sessionData: any = {
                    country_code: 'IN',
                    partner_id: evse.partner_id ?? '',
                    location_id: location.ocpi_location_id,
                    evse_uid: evse.uid,
                    connector_id: connectorData.connector.connector_id,
                    authorization_reference: beckn_order_id,
                    status: ChargingSessionStatus.PENDING,
                };
                
                // Only add requested_energy_units if paymentTxn exists (BPP beneficiary)
                if (paymentTxn?.requested_energy_units) {
                    sessionData.requested_energy_units = paymentTxn.requested_energy_units;
                }
                
                session = await SessionDbService.create({
                    data: sessionData,
                });
            }
            const response = await AdminCommandsModule.startCharging(req);
            const ocpiCommandResponse = response.payload.data as OCPICommandResponseResponse;
            const isAccepted = ocpiCommandResponse.data?.result === OCPICommandResponseType.ACCEPTED;

            // In test_mode (UAT/sandbox) the CPO does not push OCPI session updates or CDR.
            // Simulate the full lifecycle so the app receives on_update ACTIVE → on_update COMPLETED.
            if (isAccepted && session) {
                UpdateActionHandler.runTestModeSessionLifecycle(
                    session.id,
                    beckn_order_id,
                    evse.partner_id ?? '',
                    location,
                    evse,
                    evseConnector,
                ).catch((e: any) => {
                    logger.error(`🔴 Error in runTestModeSessionLifecycle: ${e?.toString()}`, e);
                });
            }

            return {
                session_status: isAccepted ? ChargingSessionStatus.ACTIVE : ChargingSessionStatus.INTERRUPTED,
            };
        } 
        else if (charging_action === ChargingAction.StopCharging) {
            const session = await SessionDbService.getByAuthorizationReference(beckn_order_id);
            if (!session) {
                throw new Error('Session not found');
            }
            // if (!session.cpo_session_id && session.partner_id) {
            //     const partner = await OCPIPartnerDbService.getById(session.partner_id);
            //     if (partner) {
            //         const partnerAdditionalProps = partner.additional_props as OCPIPartnerAdditionalProps;
            //         if (partnerAdditionalProps?.test_mode === true ) {
            //             const stopChargingDelay = partnerAdditionalProps?.stop_charging_delay ?? 10;
            //             // add a delay of 10 seconds
            //             setTimeout(async () => {
            //                 try {
            //                     // send a stop charging command to the CPO
            //                     const sessionNew = await SessionDbService.getByAuthorizationReference(beckn_order_id);
            //                     if (!sessionNew) {
            //                         throw new Error('Session not found');
            //                     }
            //                     const req = {
            //                         body: {
            //                             partner_id: sessionNew.partner_id,
            //                             session_id: sessionNew.cpo_session_id,
            //                         },
            //                     } as Request;
            //                     await AdminCommandsModule.stopCharging(req);
            //                 }
            //                 catch (e: any) {
            //                     logger.error(`🔴 Error in UpdateActionHandler.handleEVChargingUBCBppUpdateAction: ${e?.toString()}`, e);
            //                 }
            //             }, 1000 * stopChargingDelay);

            //             return {
            //                 session_status: ChargingSessionStatus.COMPLETED,
            //             };
            //         }
            //     }
            // } 
            if (!session.cpo_session_id) {
                throw new Error(`Cannot stop charging: CPO session ID not yet available for authorization_reference=${beckn_order_id}. The CPO may not have started the session yet.`);
            }

            // Synthetic session — cancel the running interval and complete immediately
            // with whatever kWh was consumed so far, then trigger CDR + refund.
            if (session.cpo_session_id.startsWith('session_test_')) {
                logger.warn(`🟡 [synthetic] Manual stop for synthetic session ${session.cpo_session_id}`);

                const running = syntheticSessionIntervals.get(session.id);
                if (running) {
                    clearInterval(running.intervalHandle);
                    clearTimeout(running.safetyHandle);
                    syntheticSessionIntervals.delete(session.id);

                    const kwhAtStop = running.getCurrentKwh();
                    logger.warn(`🟡 [synthetic] Cancelling simulation at kwh=${kwhAtStop} for ${beckn_order_id}`);

                    // Fire CDR-based completion asynchronously (final on_update from CDR)
                    running.triggerCompletion(kwhAtStop).catch((e: any) => {
                        logger.error(`🔴 [synthetic] triggerCompletion on manual stop failed: ${e?.toString()}`, e);
                    });
                }

                return { session_status: ChargingSessionStatus.COMPLETED };
            }

            const req = {
                body: {
                    partner_id: session.partner_id,
                    session_id: session.cpo_session_id,
                },
            } as Request;
            const response = await AdminCommandsModule.stopCharging(req);
            const ocpiCommandResponse = response.payload.data as OCPICommandResponseResponse;

            return {
                session_status: ocpiCommandResponse.data?.result === OCPICommandResponseType.ACCEPTED ? ChargingSessionStatus.COMPLETED : ChargingSessionStatus.ACTIVE,
            };
        }
        else {
            throw new Error('Invalid charging action');
        }
    }

    public static translateBackendToUBC(
        backendUpdatePayload: UBCUpdateRequestPayload,
        ExtractedOnUpdateResponseBody: ExtractedOnUpdateResponsePayload,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        existingOnStatusResponse: any | null // Not used currently, but kept for consistency with reference implementation
    ): UBCOnUpdateRequestPayload {
        const context = Utils.getBPPContext({
            ...backendUpdatePayload.context,
            action: BecknAction.on_update,
        });

        const order = backendUpdatePayload.message.order;
        const fulfillment = order['beckn:fulfillment'];
        const deliveryAttributes = fulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown>;
        const sessionStatus = ExtractedOnUpdateResponseBody.session_status;

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

        // Per schema line 2338-2340: when sessionStatus is ACTIVE, deliveryAttributes must include connectorType and maxPowerKW
        // Ensure these fields are preserved from update request or kept if already present
        const updatedDeliveryAttributes = {
            ...deliveryAttributes, // reuse everything from update request first (including connectorType and maxPowerKW if present)
            "@context": (deliveryAttributes?.['@context'] as string) || "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingSession/v1/context.jsonld",
            "@type": "ChargingSession" as const,
            'sessionStatus': sessionStatus, // only update sessionStatus
        };


        // Per schema (lines 2251-2360, 2556-2630): on_update should NOT include orderAttributes
        // Build order object explicitly, excluding orderAttributes
        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": order['@context'],
                    "@type": order['@type'],
                    "beckn:id": order['beckn:id'],
                    'beckn:orderStatus': orderStatus, // only update orderStatus
                    "beckn:seller": order['beckn:seller'],
                    "beckn:buyer": order['beckn:buyer'],
                    "beckn:orderItems": order['beckn:orderItems'],
                    "beckn:orderValue": order['beckn:orderValue'],
                    "beckn:payment": order['beckn:payment'],
                    'beckn:fulfillment': {
                        ...fulfillment, // reuse everything from update request first
                        "@context": fulfillment?.['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                        "@type": fulfillment?.['@type'] || "beckn:Fulfillment",
                        "beckn:id": fulfillment?.['beckn:id'] || `fulfillment-${order['beckn:id']}`,
                        "beckn:mode": fulfillment?.['beckn:mode'] || "RESERVATION",
                        'beckn:deliveryAttributes': updatedDeliveryAttributes,
                    },
                },
            },
        };

        // Conditionally include order_value if present in backend response
        if (ExtractedOnUpdateResponseBody?.order_value) {
            ubcOnUpdatePayload.message.order['beckn:orderValue'] = ExtractedOnUpdateResponseBody.order_value;
        }

        return ubcOnUpdatePayload;
    }

    /**
     * Sends on_update response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnUpdateCallToBecknONIX(payload: UBCOnUpdateRequestPayload): Promise<any> {
        const bppHost = Utils.onix_bpp_caller_url();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_update}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    static async sendErrorOnUpdateResponse(
        originalRequest: UBCUpdateRequestPayload,
        error: Error
    ): Promise<void> {
        // Create new context with action changed to 'on_update' (response action)
        const context = Utils.getBPPContext({
            ...originalRequest.context,
            action: BecknAction.on_update,
        });

        // Send back the same request payload, just change the action in context
        // This allows BAP to resolve the stitched response even on error
        const errorOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: context,
            message: originalRequest.message,
        };

        logger.debug(`🟡 Sending error on_update response due to processing failure`, {
            data: {
                messageId: context.message_id,
                error: error.message,
            },
        });

        // Send the error response to BPP ONIX, which will forward it to BAP
        await this.sendOnUpdateCallToBecknONIX(errorOnUpdatePayload);
    }

    /**
     * Simulates the real CPO session lifecycle for UAT/sandbox where the CPO does
     * not push OCPI callbacks.
     *
     * Real flow replicated:
     *   1. Mark session ACTIVE immediately (CPO started charging).
     *   2. Every 10 s push a kWh update (CPO PUT/PATCH /sessions).
     *   3. When kWh consumed ≥ 90% of pre-paid units → auto-cutoff fires.
     *      (Total simulation time: 2 minutes over 12 ticks)
     *   4. Mark session COMPLETED, create synthetic CDR, trigger on_update COMPLETED.
     */
    private static async runTestModeSessionLifecycle(
        sessionDbId: string,
        becknOrderId: string,
        partnerId: string,
        location: { ocpi_location_id: string },
        evse: { uid: string; partner_id: string | null },
        connector: { connector_id: string },
    ): Promise<void> {
        const TICK_INTERVAL_MS = 10 * 1000; // 10 seconds between CPO session updates

        const syntheticCpoSessionId = `session_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const startTime = new Date();

        logger.warn(`🟡 [synthetic] Starting session lifecycle for ${becknOrderId}`, {
            data: { sessionDbId, syntheticCpoSessionId, tickIntervalMs: TICK_INTERVAL_MS },
        });

        // Step 1: mark session ACTIVE immediately (CPO acknowledged start)
        await SessionDbService.update(sessionDbId, {
            status: ChargingSessionStatus.ACTIVE,
            cpo_session_id: syntheticCpoSessionId,
            start_date_time: startTime,
        });

        logger.warn(`🟢 [synthetic] Session ACTIVE for ${becknOrderId}`, { data: { syntheticCpoSessionId } });

        // Resolve pre-paid energy (Wh) for the 90% auto-cutoff threshold
        const sessionSnap = await SessionDbService.getById(sessionDbId);
        let requestedEnergyUnitsWh = sessionSnap?.requested_energy_units?.toNumber() ?? 0;
        if (!requestedEnergyUnitsWh) {
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: { authorization_reference: becknOrderId },
            });
            requestedEnergyUnitsWh = paymentTxn?.requested_energy_units?.toNumber() ?? 0;
        }

        logger.warn(`🟡 [synthetic] Energy threshold for ${becknOrderId}`, {
            data: { requestedEnergyUnitsWh, threshold90Wh: requestedEnergyUnitsWh * 0.9 },
        });

        let tickCount  = 0;
        let currentKwh = 0;
        let completed  = false;

        // ── shared completion handler — called on 90% auto-cutoff or manual stop ─
        const triggerCompletion = async (finalKwh: number): Promise<void> => {
            if (completed) return;
            completed = true;
            syntheticSessionIntervals.delete(sessionDbId);

            const now          = new Date();
            const totalTimeSec = Math.round((now.getTime() - startTime.getTime()) / 1000);

            // Mark session COMPLETED
            await SessionDbService.update(sessionDbId, {
                status: ChargingSessionStatus.COMPLETED,
                kwh:    finalKwh,
                end_date_time: now,
            });

            // Create synthetic CDR (mirrors what real CPO would POST to /cdrs)
            const syntheticCdrId = `cdr_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
            await CdrDbService.create({
                data: {
                    country_code:            'IN',
                    party_id:                'UBC',
                    ocpi_cdr_id:             syntheticCdrId,
                    start_date_time:         startTime,
                    end_date_time:           now,
                    session_id:              syntheticCpoSessionId,
                    authorization_reference: becknOrderId,
                    cdr_token:               {},
                    auth_method:             'AUTH_REQUEST',
                    cdr_location: {
                        id:           location.ocpi_location_id,
                        evse_uid:     evse.uid,
                        connector_id: connector.connector_id,
                    },
                    currency:         'INR',
                    charging_periods: [],
                    total_cost:       { excl_vat: 0, incl_vat: 0 },
                    total_energy:     finalKwh,
                    total_time:       BigInt(totalTimeSec),
                    last_updated:     now,
                    partner_id:       partnerId,
                },
            });

            logger.warn(`🟢 [synthetic] CDR created for ${becknOrderId}`, {
                data: { syntheticCdrId, finalKwh, totalTimeSec },
            });

            // Triggers on_update COMPLETED + refund → sent to app
            await ChargingService.handleActionOnChargingCompleted(syntheticCpoSessionId);
            logger.warn(`🟢 [synthetic] Lifecycle complete for ${becknOrderId}`);
        };

        // Step 2: tick every 10 s simulating CPO session updates.
        // Auto-completes when consumed kWh ≥ 90% of pre-paid units.
        // Also completes on manual STOP via triggerCompletion.
        const interval = setInterval(async () => {
            try {
                tickCount++;
                currentKwh = parseFloat((0.1 * tickCount).toFixed(3)); // 0.1 kWh per tick as a placeholder

                // Stop ticking if session was externally marked non-ACTIVE
                const latest = await SessionDbService.getById(sessionDbId);
                if (!latest || latest.status !== ChargingSessionStatus.ACTIVE) {
                    clearInterval(interval);
                    logger.warn(`🟡 [synthetic] Session no longer ACTIVE — stopping kWh ticker for ${becknOrderId}`);
                    return;
                }

                // Simulate CPO PUT/PATCH /sessions → update kWh in DB
                await SessionDbService.update(sessionDbId, { kwh: currentKwh });

                logger.warn(`🟡 [synthetic] kWh tick ${tickCount}: kwh=${currentKwh} for ${becknOrderId}`);

                // Auto-cutoff: stop when consumed Wh ≥ 90% of pre-paid Wh
                const consumedWh  = 1000 * currentKwh;
                const threshold90 = requestedEnergyUnitsWh * 0.9;
                if (requestedEnergyUnitsWh > 0 && consumedWh >= threshold90) {
                    clearInterval(interval);
                    logger.warn(`🟡 [synthetic] Auto-cutoff: consumed=${currentKwh}kWh >= 90% threshold=${(threshold90 / 1000).toFixed(3)}kWh for ${becknOrderId}`);
                    await triggerCompletion(currentKwh);
                }
            }
            catch (e: any) {
                clearInterval(interval);
                logger.error(`🔴 [synthetic] Tick error for ${becknOrderId}: ${e?.toString()}`, e);
            }
        }, TICK_INTERVAL_MS);

        // No hard time limit — session completes when 90% energy consumed or manually stopped.
        // Use a no-op timeout handle so the map entry shape stays consistent.
        const safetyHandle = setTimeout(() => { /* no-op */ }, 0);

        // Register so manual stop can cancel the ticker and trigger CDR-based completion
        syntheticSessionIntervals.set(sessionDbId, {
            intervalHandle: interval,
            safetyHandle,
            triggerCompletion,
            getCurrentKwh: () => currentKwh,
        });
    }
}
