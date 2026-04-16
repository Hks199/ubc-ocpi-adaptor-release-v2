import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import OnixBppController from "../../controller/OnixBppController";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import { UBCCancelRequestPayload } from "../../schema/v2.0.0/actions/cancel/types/CancelPayload";
import { UBCOnCancelRequestPayload } from "../../schema/v2.0.0/actions/cancel/types/OnCancelPayload";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import { OrderStatus } from "../../schema/v2.0.0/enums/OrderStatus";
import { ChargingSessionStatus } from "../../schema/v2.0.0/enums/ChargingSessionStatus";
import { BecknPaymentStatus } from "../../schema/v2.0.0/enums/PaymentStatus";
import Utils from "../../../utils/Utils";
import BppOnixRequestService from "../../services/BppOnixRequestService";
import BecknLogDbService from "../../../db-services/BecknLogDbService";
import { Prisma } from "@prisma/client";
import UpdateActionHandler from "./UpdateActionHandler";
import { ChargingAction } from "../../schema/v2.0.0/enums/ChargingAction";
import { Context } from "../../schema/v2.0.0/types/Context";
import { SessionDbService } from "../../../db-services/SessionDbService";
import ChargingService from "../services/ChargingService";
import PaymentTxnDbService from "../../../db-services/PaymentTxnDbService";

/**
 * Handler for cancel action
 */
export default class CancelActionHandler {
    public static async handleBppCancelAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCCancelRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.cancel, req, () => {
            CancelActionHandler.handleEVChargingUBCBppCancelAction(payload)
                .then((ubcOnCancelResponsePayload: UBCOnCancelRequestPayload) => {
                    logger.debug(`🟢 Sending cancel response in handleBppCancelAction`, {
                        data: ubcOnCancelResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppCancelAction: 'Something went wrong'`, e);
                });
        });
    }

    /**
     * Checks if charging has started by looking at on_update logs
     * Returns true if sessionStatus is ACTIVE or COMPLETED (cannot cancel)
     */
    private static async hasChargingStarted(transactionId: string): Promise<boolean> {
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_update}`,
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
            const latestUpdateLog = becknLogs.records[0].payload as Record<string, unknown>;
            const message = latestUpdateLog.message as Record<string, unknown> | undefined;
            const order = message?.order as Record<string, unknown> | undefined;
            
            // Check sessionStatus in fulfillment deliveryAttributes
            const fulfillment = order?.['beckn:fulfillment'] as Record<string, unknown> | undefined;
            const deliveryAttributes = fulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown> | undefined;
            const sessionStatus = deliveryAttributes?.sessionStatus as string | undefined;

            logger.debug(`Latest on_update sessionStatus for transaction ${transactionId}: ${sessionStatus}`);

            // If sessionStatus is ACTIVE or COMPLETED, cannot cancel
            if (sessionStatus === ChargingSessionStatus.ACTIVE || sessionStatus === ChargingSessionStatus.COMPLETED) {
                return true;
            }
        }

        return false;
    }


  
    /**
     * Builds on_cancel response based on cancellation eligibility
     * Per spec: All fields come from on_confirm exactly as shown
     */
    public static async buildOnCancelResponse(cancelRequest: UBCCancelRequestPayload): Promise<UBCOnCancelRequestPayload> {
        const transactionId = cancelRequest.context.transaction_id;
        const order = cancelRequest.message.order;

        const context = Utils.getBPPContext({
            ...cancelRequest.context,
            action: BecknAction.on_cancel,
        });

        // Fetch on_confirm order - single source per spec
        const onInitResponse = await UpdateActionHandler.fetchExistingBppOnInitResponse(transactionId);
        const onOrderObject = onInitResponse?.message?.order;

        const authorizationReference = onInitResponse?.message?.order?.['beckn:id'];
        const session = await SessionDbService.getByAuthorizationReference(authorizationReference);
        if (!session) {
            logger.debug(`Session not found for transaction ${transactionId}`);
            return {
                context: context,
                message: {
                    order: onOrderObject as UBCOnCancelRequestPayload['message']['order'],
                },
            };
        }
        
        // If confirm/on_confirm not present, return REJECTED status
        if (!onOrderObject) {
            logger.debug(`Cancel rejected for transaction ${transactionId}: confirm/on_confirm not found`);
            
            const onCancelOrder: Record<string, unknown> = {
                '@context': order['@context'],
                '@type': order['@type'],
                'beckn:id': order['beckn:id'],
                'beckn:orderStatus': OrderStatus.REJECTED,
                'beckn:seller': order['beckn:seller'],
                'beckn:buyer': order['beckn:buyer'],
                'beckn:orderItems': order['beckn:orderItems'],
            };

            return {
                context: context,
                message: {
                    order: onCancelOrder as UBCOnCancelRequestPayload['message']['order'],
                },
            };
        }

        // Check if charging has started
        const chargingStarted = await this.hasChargingStarted(transactionId);


        if (chargingStarted) {
            await UpdateActionHandler.sendUpdateCallToBackend({
                metadata: {
                    domain: BecknDomain.EVChargingUBC,
                    bpp_id: cancelRequest.context.bpp_id,
                    bpp_uri: cancelRequest.context.bpp_uri,
                    beckn_transaction_id: cancelRequest.context.transaction_id,
                },
                payload: {
                    charge_point_connector_id: onOrderObject['beckn:orderItems'][0]['beckn:orderedItem'],
                    beckn_order_id: onOrderObject['beckn:id'],
                    charging_action: ChargingAction.StopCharging,
                },
            }, 'BPP');
        } 

        else {
            await SessionDbService.update(session.id, {
                status: ChargingSessionStatus.CANCELLED,
            });
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorizationReference,
                },
            });
            if (!paymentTxn) {
                logger.debug(`Payment transaction not found for transaction ${transactionId}`);
                throw new Error(`Payment transaction not found for transaction ${transactionId}`);
            }
            await ChargingService.processRefundIfRequired(null, paymentTxn?.id, session, authorizationReference, 'CancelCharging');
        }
        
        const ubcOnCancelPayload = this.buildOnCancelRequestBody(context, onOrderObject, transactionId);

        return ubcOnCancelPayload;
    }

    public static buildOnCancelRequestBody(context: Context, onOrderObject: Record<string, unknown>, transactionId: string): UBCOnCancelRequestPayload {

     // Can cancel - charging has not started
     const orderStatus = OrderStatus.CANCELLED;
     logger.debug(`Cancel approved for transaction ${transactionId}`);

     // Build on_cancel order from on_confirm per spec
     // orderItems: only orderedItem, quantity, price (NO acceptedOffer)
     // payment: specific fields only (NO paymentAttributes.settlementAccounts)
     const sourceOrderItems = onOrderObject['beckn:orderItems'] as Array<Record<string, unknown>>;
     const sourceBuyer = onOrderObject['beckn:buyer'] as Record<string, unknown>;
     const sourcePayment = onOrderObject['beckn:payment'] as Record<string, unknown>;
     
     // Build orderItems without acceptedOffer
     const orderItems = sourceOrderItems.map(item => ({
         'beckn:orderedItem': item['beckn:orderedItem'],
         'beckn:quantity': item['beckn:quantity'],
         'beckn:price': item['beckn:price'],
     }));
     
     // Build buyer - use from on_confirm
     const buyer: Record<string, unknown> = {
         '@context': sourceBuyer['@context'],
         '@type': sourceBuyer['@type'],
         'beckn:id': sourceBuyer['beckn:id'],
         'beckn:role': sourceBuyer['beckn:role'],
         'beckn:displayName': sourceBuyer['beckn:displayName'],
         'beckn:taxID': sourceBuyer['beckn:taxID'],
     };
     
     // Add buyerAttributes if present in on_confirm
     const sourceBuyerAttributes = sourceBuyer['beckn:buyerAttributes'] as Record<string, unknown> | undefined;
     if (sourceBuyerAttributes) {
         buyer['beckn:buyerAttributes'] = sourceBuyerAttributes;
     }
     
     // Build payment object - specific fields only
     const paymentObject: Record<string, unknown> = {
         '@context': sourcePayment['@context'],
         '@type': sourcePayment['@type'],
         'beckn:id': sourcePayment['beckn:id'],
         'beckn:amount': sourcePayment['beckn:amount'],
         'beckn:paymentURL': sourcePayment['beckn:paymentURL'],
         'beckn:txnRef': sourcePayment['beckn:txnRef'],
         'beckn:paidAt': sourcePayment['beckn:paidAt'],
         'beckn:beneficiary': 'BUYER',
         'beckn:paymentStatus': BecknPaymentStatus.REFUNDED,
     };

     // Include paymentAttributes with only upiTransactionId (no settlementAccounts)
     const sourcePaymentAttributes = sourcePayment['beckn:paymentAttributes'] as Record<string, unknown> | undefined;
     if (sourcePaymentAttributes) {
         paymentObject['beckn:paymentAttributes'] = {
             '@context': sourcePaymentAttributes['@context'] || 'https://raw.githubusercontent.com/bhim/ubc-tsd/main/beckn-schemas/UBCExtensions/v1/context.jsonld',
             '@type': sourcePaymentAttributes['@type'] || 'UBCPaymentAttributes',
             'upiTransactionId': sourcePaymentAttributes['upiTransactionId'] || sourcePayment['beckn:upiTransactionId'] || 'UPI123456789012',
         };
     }
     
     const onCancelOrder: Record<string, unknown> = {
         '@context': onOrderObject['@context'],
         '@type': onOrderObject['@type'],
         'beckn:id': onOrderObject['beckn:id'],
         'beckn:orderStatus': orderStatus,
         'beckn:seller': onOrderObject['beckn:seller'],
         'beckn:buyer': buyer,
         'beckn:orderItems': orderItems,
         'beckn:orderValue': onOrderObject['beckn:orderValue'],
         'beckn:payment': paymentObject,
     };

     const ubcOnCancelPayload: UBCOnCancelRequestPayload = {
         context: context,
         message: {
             order: onCancelOrder as UBCOnCancelRequestPayload['message']['order'],
         },
     };

     return ubcOnCancelPayload;

    }

    /**
     * Sends on_cancel response to beckn-ONIX (BPP)
     */
    static async sendOnCancelCallToBecknONIX(payload: UBCOnCancelRequestPayload): Promise<any> {
        const bppHost = Utils.onix_bpp_caller_url();
        const response = await BppOnixRequestService.sendPostRequest({
            url: `${bppHost}/${BecknAction.on_cancel}`,
            data: payload,
        }, BecknDomain.EVChargingUBC);
        return response;
    }

    /**
     * Main handler for cancel action on BPP side
     */
    
    public static async handleEVChargingUBCBppCancelAction(cancelRequest: UBCCancelRequestPayload): Promise<UBCOnCancelRequestPayload> {
        try {
            // Build on_cancel response based on charging status
            const onCancelResponse = await this.buildOnCancelResponse(cancelRequest);

            // Send on_cancel response to Beckn ONIX
            await this.sendOnCancelCallToBecknONIX(onCancelResponse);

            logger.debug(`✅ On_cancel response sent successfully for transaction ${cancelRequest.context.transaction_id}`);
            
            return onCancelResponse;
        } 
        catch (error) {
            logger.error(`❌ Failed to process cancel action`, error instanceof Error ? error : undefined);
            throw error;
        }
    }


    public static async handleEVChargingUBCBppAutoCancelAction(becknTransactionId: string): Promise<void> {
        try {

            const onInitResponse = await UpdateActionHandler.fetchExistingBppOnInitResponse(becknTransactionId);

            if (!onInitResponse) {
                logger.debug(`No on_init response found for transaction ${becknTransactionId}`);
                return;
            }

            const onOrderObject = onInitResponse?.message?.order;

            const context = Utils.getBPPContext({
                ...onInitResponse?.context,
                action: BecknAction.on_cancel,
            });

            // Build on_cancel response based on charging status
            const onCancelResponse = await this.buildOnCancelRequestBody(context, onOrderObject, becknTransactionId);

            const authorizationReference = onInitResponse?.message?.order?.['beckn:id'];
            const session = await SessionDbService.getByAuthorizationReference(authorizationReference);
            if (!session) {
                logger.debug(`Session not found for transaction ${becknTransactionId}`);
                return;
            }

            await SessionDbService.update(session.id, {
                status: ChargingSessionStatus.AUTO_CANCELLED,
            });
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorizationReference,
                },
            });
            if (!paymentTxn) {
                logger.debug(`Payment transaction not found for transaction ${becknTransactionId}`);
                throw new Error(`Payment transaction not found for transaction ${becknTransactionId}`);
            }
            await ChargingService.processRefundIfRequired(null, paymentTxn?.id, session, authorizationReference, 'CancelCharging');

            // Send on_cancel response to Beckn ONIX
            await this.sendOnCancelCallToBecknONIX(onCancelResponse);

            logger.debug(`✅ On_cancel response sent successfully for transaction ${becknTransactionId}`);
            
        } 
        catch (error) {
            logger.error(`❌ Failed to process cancel action`, error instanceof Error ? error : undefined);
            throw error;
        }
    }
}
