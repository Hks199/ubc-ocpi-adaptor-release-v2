import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { UBCStatusRequestPayload } from '../../schema/v2.0.0/actions/status/types/StatusPayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import Utils from '../../../utils/Utils';
import OnixBppController from '../../controller/OnixBppController';
import { UBCOnStatusRequestPayload } from '../../schema/v2.0.0/actions/status/types/OnStatusPayload';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import { BecknPayment } from '../../schema/v2.0.0/types/Payment';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { UBCOnSelectRequestPayload } from '../../schema/v2.0.0/actions/select/types/OnSelectPayload';
import { UBCOnInitRequestPayload } from '../../schema/v2.0.0/actions/init/types/OnInitPayload';
import BecknLogDbService from '../../../db-services/BecknLogDbService';
import { Prisma } from '@prisma/client';
import { LocationDbService } from '../../../db-services/LocationDbService';
import { OCPIStatusMapper } from '../../utils/OCPIStatusMapper';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { mapGenericToBecknStatus } from '../../services/PaymentServices/Razorpay/RazorpayPaymentService';

/**
 * Handler for status action (BAP → BPP request-response)
 * This handles the status request from BAP and responds with on_status
 */
export default class StatusActionHandler {
    public static async handleBppStatusAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCStatusRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.status, req, () => {
            StatusActionHandler.handleEVChargingUBCBppStatusAction(payload)
                .then((ubcOnStatusResponsePayload: UBCOnStatusRequestPayload) => {
                    logger.debug(`🟢 Sending status response in handleBppStatusAction`, {
                        data: ubcOnStatusResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppStatusAction: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppStatusAction(
        reqPayload: UBCStatusRequestPayload
    ): Promise<UBCOnStatusRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'status', messageId: reqId };

        try {
            // Fetch existing on_select and on_init responses
            logger.debug(`🟡 [${reqId}] Fetching existing responses in handleEVChargingUBCBppStatusAction`, { data: { logData, reqPayload } });
            const existingOnSelectResponse = await StatusActionHandler.fetchExistingBppOnSelectResponse(reqPayload.context.transaction_id);
            if (!existingOnSelectResponse) {
                throw new Error('No existing on_select response found. Please complete select action first.');
            }

            const existingOnInitResponse = await StatusActionHandler.fetchExistingBppOnInitResponse(reqPayload.context.transaction_id);

            // translate CPO's response to UBC Schema (connector status fetched from EVSE table)
            logger.debug(`🟡 [${reqId}] Translating to UBC payload in handleEVChargingUBCBppStatusAction`, { data: { reqPayload, existingOnSelectResponse, existingOnInitResponse } });
            const ubcOnStatusPayload: UBCOnStatusRequestPayload = await StatusActionHandler.translateBackendToUBC(
                reqPayload,
                existingOnSelectResponse,
                existingOnInitResponse
            );

            // Call BAP on_status
            logger.debug(`🟡 [${reqId}] Sending on_status call to Beckn ONIX in handleEVChargingUBCBppStatusAction`, { data: { ubcOnStatusPayload } });
            const response = await StatusActionHandler.sendOnStatusCallToBecknONIX(ubcOnStatusPayload);
            logger.debug(`🟢 [${reqId}] Sent on_status call to Beckn ONIX in handleEVChargingUBCBppStatusAction`, { data: { response } });

            // return the response
            return ubcOnStatusPayload;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in StatusActionHandler.handleEVChargingUBCBppStatusAction: ${e?.toString()}`, e, {
                data: { logData },
            });
            
            throw e;
        }
    }

    public static async fetchExistingBppOnSelectResponse(transactionId: string): Promise<UBCOnSelectRequestPayload | null> {
        /**
         * Fetch existing on_select response for this transaction id
         */
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_select}`,
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
            return becknLogs.records[0].payload as UBCOnSelectRequestPayload;
        }

        return null;
    }

    public static async fetchExistingBppOnInitResponse(transactionId: string): Promise<UBCOnInitRequestPayload | null> {
        /**
         * Fetch existing on_init response for this transaction id
         */
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
            return becknLogs.records[0].payload as UBCOnInitRequestPayload;
        }

        return null;
    }

    /**
     * Fetches connector status from EVSE table based on the formatted connector ID
     * @param orderedItem - Formatted connector ID (format: IND*sellerId*csId*cpId*connectorId)
     * @returns UBC connectorStatus string
     * @throws Error if EVSE is not found
     */
    public static async getConnectorStatusFromEVSE(orderedItem: string): Promise<string> {
        // Fetch connector directly from DB using beckn_connector_id
        const connectorData = await LocationDbService.getConnectorByBecknId(orderedItem);

        if (!connectorData) {
            const errorMessage = `Connector not found for beckn_connector_id: ${orderedItem}`;
            logger.error(`🔴 ${errorMessage}`, new Error(errorMessage), { 
                data: { 
                    beckn_connector_id: orderedItem,
                } 
            });
            throw new Error(errorMessage);
        }

        const { evse, location } = connectorData;

        // Map OCPI EVSE status to UBC connectorStatus
        const connectorStatus = OCPIStatusMapper.mapOCPIStatusToUBCConnectorStatus(evse.status);
        logger.debug(`🟢 Fetched connector status from EVSE`, { 
            data: { 
                ocpiStatus: evse.status,
                ubcConnectorStatus: connectorStatus,
                locationId: location.ocpi_location_id,
                evseUid: evse.uid,
            } 
        });

        return connectorStatus;
    }

    public static async translateBackendToUBC(
        statusRequestPayload: UBCStatusRequestPayload,
        existingOnSelectResponse: UBCOnSelectRequestPayload,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _existingOnInitResponse: UBCOnInitRequestPayload | null
    ): Promise<UBCOnStatusRequestPayload> {
        const selectOrder = existingOnSelectResponse.message.order;
        const statusOrder = statusRequestPayload.message.order;
        const statusPayment = statusOrder['beckn:payment'] as Record<string, unknown>;

        const context = Utils.getBPPContext({
            ...statusRequestPayload.context,
            action: BecknAction.on_status,
        });

        // Build simplified orderItems (only orderedItem per spec - no quantity, no price)
        const selectOrderItems = selectOrder['beckn:orderItems'] as Record<string, unknown>[];
        const orderItems = selectOrderItems.map(item => ({
            "beckn:orderedItem": item['beckn:orderedItem'] as string,
        }));

        // Build payment object with only necessary fields per schema
        const paymentObject: Partial<BecknPayment> = {
            "@context": statusPayment['@context'] as string,
            "@type": statusPayment['@type'] as ObjectType.payment,
            "beckn:id": statusPayment['beckn:id'] as string,
            "beckn:amount": statusPayment['beckn:amount'] as BecknPayment['beckn:amount'],
            "beckn:paymentURL": statusPayment['beckn:paymentURL'] as string,
            "beckn:txnRef": statusPayment['beckn:txnRef'] as string,
            "beckn:beneficiary": statusPayment['beckn:beneficiary'] as string,
        };

        if (statusPayment['beckn:beneficiary'] === 'BAP') {
            // Add paidAt only if present in status request
            if (statusPayment['beckn:paidAt']) {
                paymentObject['beckn:paidAt'] = statusPayment['beckn:paidAt'] as string;
            }

            // Add paymentStatus - from status request
            if (statusPayment['beckn:paymentStatus']) {
                paymentObject['beckn:paymentStatus'] = statusPayment['beckn:paymentStatus'] as BecknPaymentStatus;
            }
        }
        else {
            // If beneficiary is BPP, check payment status from payment txn table
            const transactionRef = statusPayment['beckn:txnRef'] as string;
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: transactionRef,
                },
            });

            if (paymentTxn) {
                // Add paymentStatus from payment txn if it's COMPLETED
                const paymentStatus = mapGenericToBecknStatus(paymentTxn.status);
                if (paymentStatus === BecknPaymentStatus.COMPLETED) {
                    paymentObject['beckn:paymentStatus'] = paymentStatus;
                    
                    // Add paidAt if payment was completed (use updated_at as paidAt timestamp)
                    if (paymentTxn.updated_at) {
                        paymentObject['beckn:paidAt'] = paymentTxn.updated_at.toISOString();
                    }
                }
                // Also add paymentStatus if it's not PENDING (to show current status)
                else {
                    paymentObject['beckn:paymentStatus'] = BecknPaymentStatus.PENDING;
                }
            }
        }

        // Get fulfillment from status request (which has the charging session details)
        const statusFulfillment = statusOrder['beckn:fulfillment'] as Record<string, unknown>;
        const deliveryAttributes = statusFulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown> || {};

        // Fetch actual connector status from EVSE table
        let connectorStatus = deliveryAttributes['connectorStatus'] as string | undefined;
        // Extract connector ID from orderedItem (format: IND*sellerId*csId*cpId*connectorId)
        const orderedItem = orderItems[0]?.['beckn:orderedItem'] as string;
        if (orderedItem) {
            // This will throw an error if EVSE is not found
            connectorStatus = await StatusActionHandler.getConnectorStatusFromEVSE(orderedItem);
        }
        else {
            // If no orderedItem, use default from status request
            logger.debug(`🟡 No orderedItem found, using connectorStatus from status request`, { 
                data: { connectorStatus } 
            });
        }

        // Update deliveryAttributes with actual connectorStatus from EVSE
        // Per schema line 2096-2103: deliveryAttributes must have @context, @type, and connectorStatus
        const updatedDeliveryAttributes = {
            "@context": deliveryAttributes['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingSession/v1/context.jsonld",
            "@type": deliveryAttributes['@type'] || "ChargingSession",
            ...deliveryAttributes,
            connectorStatus: connectorStatus || deliveryAttributes['connectorStatus'] || 'PREPARING',
            // Ensure sessionStatus is present
            sessionStatus: deliveryAttributes['sessionStatus'] || 'PENDING',
        };

        // Update fulfillment with updated deliveryAttributes
        // Per schema line 2091-2104: fulfillment must always be included with proper structure
        const updatedFulfillment = {
            "@context": statusFulfillment?.['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
            "@type": statusFulfillment?.['@type'] || "beckn:Fulfillment",
            "beckn:id": statusFulfillment?.['beckn:id'] || `fulfillment-${statusOrder['beckn:id']}`,
            "beckn:mode": statusFulfillment?.['beckn:mode'] || "RESERVATION",
            ...(statusFulfillment || {}),
            'beckn:deliveryAttributes': updatedDeliveryAttributes,
        };

        // Per spec: on_status response to status request MUST include fulfillment with charging session details
        // Reference: lines 2091-2104 in UBC spec
        const ubcOnStatusPayload: UBCOnStatusRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": statusOrder['@context'],
                    "@type": ObjectType.order,
                    "beckn:id": statusOrder['beckn:id'], // from status request
                    "beckn:orderStatus": OrderStatus.PENDING, // explicitly set to PENDING per schema
                    "beckn:seller": statusOrder['beckn:seller'], // from status request
                    "beckn:buyer": statusOrder['beckn:buyer'], // from status request
                    "beckn:orderItems": orderItems as any, // simplified per schema (only orderedItem)
                    "beckn:orderValue": statusOrder['beckn:orderValue'] as any, // from status request
                    "beckn:fulfillment": updatedFulfillment as any, // Include fulfillment with actual connectorStatus from EVSE
                    "beckn:payment": paymentObject as BecknPayment, // only necessary fields per schema
                },
            },
        };
        return ubcOnStatusPayload;
    }

    /**
     * Sends on_status response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnStatusCallToBecknONIX(payload: UBCOnStatusRequestPayload): Promise<void> {
        const bppHost = payload?.context?.bpp_uri || Utils.getBppUrl();
        await BppOnixRequestService.sendPostRequest({
            url: `${bppHost}/${BecknAction.on_status}`,
            data: payload,
        }, BecknDomain.EVChargingUBC);
    }
}

