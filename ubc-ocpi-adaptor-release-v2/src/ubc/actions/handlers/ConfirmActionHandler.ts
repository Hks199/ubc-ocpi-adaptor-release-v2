import { Request } from 'express';
import { logger } from '../../../services/logger.service';
import { HttpResponse } from '../../../types/responses';
import { UBCConfirmRequestPayload } from '../../schema/v2.0.0/actions/confirm/types/ConfirmPayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import OnixBppController from '../../controller/OnixBppController';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { UBCOnConfirmRequestPayload } from '../../schema/v2.0.0/actions/confirm/types/OnConfirmPayload';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import Utils from '../../../utils/Utils';
import { ExtractedConfirmRequestBody } from '../../schema/v2.0.0/actions/confirm/types/ExtractedConfirmRequestPayload';
import { ExtractedOnConfirmResponsePayload } from '../../schema/v2.0.0/actions/confirm/types/ExtractedOnConfirmResponsePayload';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { PaymentTxnAdditionalProps } from '../../../types/PaymentTxn';
import { EvseDbService } from '../../../db-services/EvseDbService';
import { SessionDbService } from '../../../db-services/SessionDbService';
import { LocationDbService } from '../../../db-services/LocationDbService';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { convertOcpiStandardToConnectorType } from '../services/PublishActionService';

/**
 * Handler for confirm action
 */
export default class ConfirmActionHandler {
    public static async handleBppConfirmAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCConfirmRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.confirm, req, () => {
            ConfirmActionHandler.handleEVChargingUBCBppConfirmAction(payload)
                .then((ubcOnConfirmResponsePayload: UBCOnConfirmRequestPayload) => {
                    logger.debug(`🟢 Sending confirm response in handleBppConfirmAction`, {
                        data: ubcOnConfirmResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppConfirmAction: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppConfirmAction(
        reqPayload: UBCConfirmRequestPayload
    ): Promise<UBCOnConfirmRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'confirm', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppConfirmAction`,
                { data: { logData, reqPayload } }
            );
            const backendConfirmPayload: ExtractedConfirmRequestBody =
                ConfirmActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending confirm call to backend in handleEVChargingUBCBppConfirmAction`,
                { data: { backendConfirmPayload } }
            );
            const ExtractedOnConfirmResponseBody: ExtractedOnConfirmResponsePayload =
                await ConfirmActionHandler.sendConfirmCallToBackend(backendConfirmPayload);
            logger.debug(
                `🟢 [${reqId}] Received confirm response from backend in handleEVChargingUBCBppConfirmAction`,
                { data: { ExtractedOnConfirmResponseBody } }
            );

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppConfirmAction`,
                { data: { reqPayload, ExtractedOnConfirmResponseBody } }
            );
            const ubcOnConfirmPayload: UBCOnConfirmRequestPayload =
                await ConfirmActionHandler.translateBackendToUBC(
                    reqPayload,
                    ExtractedOnConfirmResponseBody
                );

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_confirm call to Beckn ONIX in handleEVChargingUBCBppConfirmAction`,
                { data: { ubcOnConfirmPayload } }
            );
            const response =
                await ConfirmActionHandler.sendOnConfirmCallToBecknONIX(ubcOnConfirmPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_confirm call to Beckn ONIX in handleEVChargingUBCBppConfirmAction`,
                { data: { response } }
            );

            // return the response
            return ubcOnConfirmPayload;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppConfirmAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );

            // Send error response to BAP side so the stitched response can be resolved
            // This prevents the request from getting stuck in REQUESTS_STORE waiting for a callback
            // try {
            //     await ConfirmActionHandler.sendErrorOnConfirmResponse(reqPayload, e instanceof Error ? e : new Error(e?.toString() || 'Unknown error'));
            // }
            // catch (sendError: any) {
            //     logger.error(`🔴 [${reqId}] Error sending error on_confirm response`, {
            //         data: { message: 'Failed to send error response' },
            //         error: sendError
            //     });
            // }

            throw e;
        }
    }

    public static translateUBCToBackendPayload(
        payload: UBCConfirmRequestPayload
    ): ExtractedConfirmRequestBody {
        const backendConfirmPayload: ExtractedConfirmRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                // v0.9: Use beckn:id instead of beckn:orderNumber
                beckn_order_id: payload.message.order['beckn:id'],
            },
        };
        return backendConfirmPayload;
    }

    public static async sendConfirmCallToBackend(
        payload: ExtractedConfirmRequestBody
    ): Promise<ExtractedOnConfirmResponsePayload> {

        const becknOrderId = payload.payload.beckn_order_id;
        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                beckn_transaction_id: becknOrderId,
                status: BecknPaymentStatus.COMPLETED,
            },
        });
        if (!paymentTxn) {
            return {
                order_status: OrderStatus.CONFIRMED,
                payment_received_at: new Date().toISOString(),
            };
        }

        const paymentAdditionalProps = paymentTxn?.additional_props as PaymentTxnAdditionalProps;
        const paymentReceivedAt = paymentAdditionalProps?.payment_received_at;

        const session = await SessionDbService.getByAuthorizationReference(becknOrderId);

        const evse = await EvseDbService.getByEvseUId(session?.evse_uid ?? '');

        const evseStatus = evse?.status;

        let orderStatus = evseStatus === 'AVAILABLE' ? OrderStatus.CONFIRMED : OrderStatus.FAILED;
        
        return {
            order_status: orderStatus,
            payment_received_at: paymentReceivedAt ?? new Date().toISOString(),
        };
    }

    public static async translateBackendToUBC(
        backendConfirmPayload: UBCConfirmRequestPayload,
        ExtractedOnConfirmResponseBody: ExtractedOnConfirmResponsePayload
    ): Promise<UBCOnConfirmRequestPayload> {
        const confirmOrder = backendConfirmPayload.message.order;
        
        // Get connector details from orderedItem
        const orderItems = confirmOrder['beckn:orderItems'] as Array<Record<string, unknown>>;
        const orderedItem = orderItems?.[0]?.['beckn:orderedItem'] as string | undefined;
        
        let connectorType: string | undefined;
        let maxPowerKW: number | undefined;
        
        if (orderedItem) {
            try {
                // Fetch connector directly from DB using beckn_connector_id
                const connectorData = await LocationDbService.getConnectorByBecknId(orderedItem);
                
                if (connectorData) {
                    const evseConnector = connectorData.connector;
                    connectorType = convertOcpiStandardToConnectorType(evseConnector.standard);

                    if (!connectorType) {
                        logger.warn(`🟡 No connector type found for connector ${connectorData?.connector?.id}`);
                    }
                    // Convert max_electric_power from W to kW
                    if (evseConnector.max_electric_power) {
                        maxPowerKW = Number(evseConnector.max_electric_power) / 1000;
                    }
                }
            }
            catch (error) {
                logger.debug(`🟡 Could not fetch connector details for on_confirm`, {
                    data: { orderedItem, error: error instanceof Error ? error.message : String(error) }
                });
                // Continue without connector details if fetch fails
            }
        }
        
        // v0.9: OnConfirm response - added fulfillment with deliveryAttributes (sessionStatus, connectorType, maxPowerKW)
        // v0.9: Removed orderNumber, orderAttributes
        const deliveryAttributes = {
            '@context': 'https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingSession/v1/context.jsonld',
            '@type': 'ChargingSession' as const,
            sessionStatus: ChargingSessionStatus.PENDING, // Initial status, will change to ACTIVE when charging starts
            ...(connectorType && { connectorType }),
            ...(maxPowerKW !== undefined && { maxPowerKW }),
        };
        
        const ubcOnConfirmPayload: UBCOnConfirmRequestPayload = {
            context: Utils.getBPPContext({
                ...backendConfirmPayload.context,
                action: BecknAction.on_confirm,
            }),
            message: {
                order: {
                    '@context': confirmOrder['@context'],
                    '@type': confirmOrder['@type'],
                    'beckn:id': confirmOrder['beckn:id'],
                    'beckn:orderStatus': ExtractedOnConfirmResponseBody.order_status,
                    'beckn:seller': confirmOrder['beckn:seller'],
                    'beckn:buyer': confirmOrder['beckn:buyer'],
                    'beckn:orderItems': confirmOrder['beckn:orderItems'],
                    'beckn:orderValue': confirmOrder['beckn:orderValue'],
                    // v0.9: Added fulfillment with deliveryAttributes (sessionStatus, connectorType, maxPowerKW)
                    'beckn:fulfillment': {
                        '@context': 'https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld',
                        '@type': 'beckn:Fulfillment' as any,
                        'beckn:id': 'fulfillment-001',
                        'beckn:mode': 'RESERVATION',
                        'beckn:deliveryAttributes': deliveryAttributes,
                    },
                    'beckn:payment': {
                        ...confirmOrder['beckn:payment'],
                        'beckn:paidAt': ExtractedOnConfirmResponseBody.payment_received_at,
                    },
                },
            },
        };
        return ubcOnConfirmPayload;
    }

    /**
     * Sends on_confirm response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnConfirmCallToBecknONIX(payload: UBCOnConfirmRequestPayload): Promise<any> {
        const bppHost = payload?.context?.bpp_uri || Utils.getBppUrl();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_confirm}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    /**
     * Constructs and sends an error on_confirm response when processing fails.
     *
     * This function is called when an error occurs during the confirm action processing (e.g., backend call fails).
     * Instead of leaving the BAP side waiting indefinitely for a response, we send back the original request
     * payload with only the action changed to 'on_confirm'. This ensures:
     * 1. The BAP side receives a response and can resolve the stitched response
     * 2. The request doesn't get stuck in REQUESTS_STORE waiting for a callback
     * 3. The BAP can handle the error appropriately
     *
     * The error response flows: BPP → BPP ONIX → BAP ONIX → BAP → onActionsWrapper → resolveStitchedResponse
     *
     * @param originalRequest - The original confirm request payload received from BAP
     * @param error - The error that occurred during processing
     */
    static async sendErrorOnConfirmResponse(
        originalRequest: UBCConfirmRequestPayload,
        error: Error
    ): Promise<void> {
        // Create new context with action changed to 'on_confirm' (response action)
        const context = Utils.getBPPContext({
            ...originalRequest.context,
            action: BecknAction.on_confirm,
        });

        // Send back the same request payload, just change the action in context
        // This allows BAP to resolve the stitched response even on error
        const errorOnConfirmPayload = {
            context: context,
            message: originalRequest.message,
        } as unknown as UBCOnConfirmRequestPayload;

        logger.debug(`🟡 Sending error on_confirm response due to processing failure`, {
            data: {
                messageId: context.message_id,
                error: error.message,
            },
        });

        // Send the error response to BPP ONIX, which will forward it to BAP
        await this.sendOnConfirmCallToBecknONIX(errorOnConfirmPayload);
    }
}
