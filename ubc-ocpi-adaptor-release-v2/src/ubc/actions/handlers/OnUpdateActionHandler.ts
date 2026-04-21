import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import UBCResponseService from '../../services/UBCResponseService';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import Utils from '../../../utils/Utils';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { UBCOnUpdateRequestPayload } from '../../schema/v2.0.0/actions/update/types/OnUpdatePayload';
import { ExtractedOnUpdateRequestBody } from '../../schema/v2.0.0/actions/update/types/ExtractedOnUpdateRequestPayload';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import UpdateActionHandler from './UpdateActionHandler';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import BecknLogDbService from '../../../db-services/BecknLogDbService';
import { CDR as PrismaCDR } from '@prisma/client';
import { BecknOrderValueResponse } from '../../schema/v2.0.0/types/OrderValue';
import { SessionDbService } from '../../../db-services/SessionDbService';
import { calculateFinalAmountFromCDR, buildOrderValueFromFinalAmount } from '../../utils/OrderValueCalculator';
import { FinalAmount } from '../../types/FinalAmount';
import { ServiceCharge } from '../../types/ServiceCharge';
import { PaymentTxn } from '@prisma/client';
import RazorpayPaymentGatewayService from '../../services/PaymentServices/Razorpay';
// Import OCPIPrice type - using direct type definition to avoid path issues
type OCPIPrice = {
    excl_vat: number;
    incl_vat?: number;
};

/**
 * Handler for status action
 */
export default class OnUpdateActionHandler {
    public static async handleBppOnUpdateRequest(
        reqDetails: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        try {
            logger.debug(`🟡 Received on_update request in handleBppOnUpdateRequest`, {
                data: reqDetails,
            });

            const body = reqDetails.body as ExtractedOnUpdateRequestBody;

            // Forward on_update to BPP ONIX (no response needed as request comes from backend)
            await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction(body);

            logger.debug(`🟢 Sending on_update response in handleBppOnUpdateRequest`, { data: {} });

            return UBCResponseService.ack();
        } 
        catch (e: any) {
            logger.error(`🔴 Error in handleBppOnStatusRequest`, e, {
                data: { message: 'Something went wrong' },
            });

            return UBCResponseService.nack();
        }
    }

    public static async handleEVChargingUBCBppOnUpdateAction(
        reqPayload: ExtractedOnUpdateRequestBody
    ): Promise<void> {
        const { beckn_transaction_id } = reqPayload;
        const logData = { action: 'on_update', beckn_transaction_id: beckn_transaction_id };

        try {
            // Forward on_update to BPP ONIX
            logger.debug(
                `🟡 [${beckn_transaction_id}] Forwarding on_update to BPP ONIX in handleEVChargingUBCBppOnUpdateAction`,
                { data: { logData, reqPayload } }
            );
            const response = await OnUpdateActionHandler.forwardOnUpdateToBppOnix(reqPayload);
            logger.debug(
                `🟢 [${beckn_transaction_id}] Forwarded on_update to BPP ONIX in handleEVChargingUBCBppOnUpdateAction`,
                { data: { response } }
            );
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${beckn_transaction_id}] Error in OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );
            throw e;
        }
    }


    public static translateBackendToUBC(
        existingBppOnUpdateResponse: UBCOnUpdateRequestPayload,
        backendOnUpdateRequestPayload: ExtractedOnUpdateRequestBody
    ): UBCOnUpdateRequestPayload {
        const order = existingBppOnUpdateResponse.message.order;
        const fulfillment = order['beckn:fulfillment'];
        const deliveryAttributes = fulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown>;
        const sessionStatus = backendOnUpdateRequestPayload.session_status;

        // For async on_update (completed), reuse everything from existing on_update response, only update orderStatus and sessionStatus
        // Per schema (lines 2556-2630): on_update should NOT include orderAttributes
        // Build order object explicitly, excluding orderAttributes
        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: Utils.getBPPContext({
                ...existingBppOnUpdateResponse.context,
                action: BecknAction.on_update,
            }),
            message: {
                order: {
                    "@context": order['@context'],
                    "@type": order['@type'],
                    "beckn:id": order['beckn:id'],
                    'beckn:orderStatus': OrderStatus.COMPLETED, // only update orderStatus
                    "beckn:seller": order['beckn:seller'],
                    "beckn:buyer": order['beckn:buyer'],
                    "beckn:orderItems": order['beckn:orderItems'],
                    "beckn:orderValue": order['beckn:orderValue'],
                    "beckn:payment": order['beckn:payment'],
                    'beckn:fulfillment': {
                        ...fulfillment, // reuse everything from existing on_update response
                        'beckn:deliveryAttributes': {
                            ...deliveryAttributes, // reuse everything from existing on_update response
                            'sessionStatus': sessionStatus, // only update sessionStatus
                        } as never,
                    },
                },
            },
        };

        // Conditionally include order_value if present in backend request
        if (backendOnUpdateRequestPayload?.order_value) {
            ubcOnUpdatePayload.message.order['beckn:orderValue'] = backendOnUpdateRequestPayload.order_value;
        }

        return ubcOnUpdatePayload;
    }

    /**
     * Receives on_update from backend and forwards to BPP ONIX
     * Backend → BPP Provider → BPP ONIX
     * 
     * First tries to use existing on_update response (for subsequent calls),
     * then falls back to update request (for first call)
     */
    public static async forwardOnUpdateToBppOnix(
        payload: ExtractedOnUpdateRequestBody
    ): Promise<void> {
        const becknTransactionId = payload.beckn_transaction_id;

        // First try to fetch existing on_update response (for subsequent calls)
        let basePayload = await OnUpdateActionHandler.fetchExistingOnUpdateResponse(becknTransactionId);
        
        // If no on_update exists yet, use the original update request (for first call)
        if (!basePayload) {
            logger.debug(`🟡 [${becknTransactionId}] No existing on_update found, fetching update request`);
            basePayload = await UpdateActionHandler.fetchExistingBppOnUpdateResponse(becknTransactionId);
        }

        if (!basePayload) {
            throw new Error('No existing update request or on_update response found');
        }

        if (
            basePayload?.message?.order?.['beckn:id'] !==
            payload?.beckn_order_id
        ) {
            throw new Error('Order id mismatch');
        }

        if (payload?.session_status !== ChargingSessionStatus.COMPLETED) {
            throw new Error('Session status is not completed');
        }

        // Convert backend payload to UBC format
        const ubcOnUpdatePayload = this.translateBackendToUBC(basePayload, payload);

        const bppHost = Utils.onix_bpp_caller_url();

        await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_update}`,
                data: ubcOnUpdatePayload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    /**
     * Fetches existing on_update response from beckn logs (for subsequent on_update calls)
     */
    private static async fetchExistingOnUpdateResponse(
        transactionId: string
    ): Promise<UBCOnUpdateRequestPayload | null> {
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
                created_on: 'desc',
            },
            take: 1,
        });

        if (becknLogs?.records && becknLogs.records.length > 0) {
            return becknLogs.records[0].payload as UBCOnUpdateRequestPayload;
        }

        return null;
    }

    /**
     * Builds order_value from CDR total_cost and breakdown costs
     */
    private static async buildOrderValueFromCDR(
        cdr: PrismaCDR,
        paymentTxn?: PaymentTxn | null
    ): Promise<BecknOrderValueResponse> {
        const currency = cdr.currency;
        const totalCost = cdr.total_cost as unknown as OCPIPrice;

        // Get service charge from payment_txn if available
        const serviceCharge = paymentTxn?.service_charge as ServiceCharge | null | undefined;

        // Calculate final amount using shared logic with service charge percentages
        const finalAmount: FinalAmount = calculateFinalAmountFromCDR(totalCost, serviceCharge);

        const partnerId = paymentTxn?.partner_id;
        if (!partnerId) {
            throw new Error('Partner ID not found in payment_txn');
        }
        const razorpayCredentials = await RazorpayPaymentGatewayService.getCredentials(partnerId);
        if (!razorpayCredentials) {
            throw new Error('Razorpay credentials not found for partner');
        }
        const { fee_percentage: feePercentage = 0.2 } = razorpayCredentials.credentials;

        // Add this to DB
       

        // Build order value from final amount
        const orderValue = buildOrderValueFromFinalAmount(finalAmount, currency, feePercentage);

        if (cdr.session_id) {
            const session = await SessionDbService.getByCpoSessionId(cdr.session_id);
            if (session) {
                await SessionDbService.update(session.id, {
                    final_amount: finalAmount,
                    additional_props: {
                        order_value: orderValue,
                    },
                });
            }
        }

        return {
            currency: currency,
            value: orderValue.value,
            components: orderValue.components,
        };
    }

    /**
     * Handles async on_update when CDR is received (session completed)
     * CDR → Extract authorization_reference → Find PaymentTxn → Send on_update
     */
    public static async handleOnUpdateFromCDR(
        authorizationReference: string,
        cdr: PrismaCDR
    ): Promise<void> {
        const logData = { action: 'on_update_from_cdr', authorization_reference: authorizationReference };

        try {
            logger.debug(
                `🟡 [${authorizationReference}] Starting handleOnUpdateFromCDR`,
                { data: logData }
            );

            // Find PaymentTxn by authorization_reference
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorizationReference,
                },
            });

            if (!paymentTxn) {
                logger.warn(
                    `🟡 [${authorizationReference}] PaymentTxn not found in handleOnUpdateFromCDR`,
                    { data: logData }
                );
                return;
            }

            const becknTransactionId = paymentTxn.beckn_transaction_id;

            // First try to fetch existing on_update response, then fall back to update request
            let basePayload = await OnUpdateActionHandler.fetchExistingOnUpdateResponse(becknTransactionId);
            
            if (!basePayload) {
                logger.debug(`🟡 [${authorizationReference}] No existing on_update found, fetching update request`);
                basePayload = await UpdateActionHandler.fetchExistingBppOnUpdateResponse(becknTransactionId);
            }

            if (!basePayload) {
                logger.warn(
                    `🟡 [${authorizationReference}] No existing update request or on_update response found in handleOnUpdateFromCDR`,
                    { data: { ...logData, beckn_transaction_id: becknTransactionId } }
                );
                return;
            }

            const becknOrderId = basePayload.message.order['beckn:id'];

            // Build order_value from CDR with service charge from payment_txn
            const orderValue = await OnUpdateActionHandler.buildOrderValueFromCDR(cdr, paymentTxn);

            // Build ExtractedOnUpdateRequestBody
            const onUpdatePayload: ExtractedOnUpdateRequestBody = {
                beckn_order_id: becknOrderId,
                session_status: ChargingSessionStatus.COMPLETED,
                beckn_transaction_id: becknTransactionId,
                order_value: orderValue,
            };

            logger.debug(
                `🟡 [${authorizationReference}] Forwarding on_update to BPP ONIX in handleOnUpdateFromCDR`,
                { data: { ...logData, onUpdatePayload } }
            );

            // Forward on_update to BPP ONIX
            await OnUpdateActionHandler.forwardOnUpdateToBppOnix(onUpdatePayload);

            // Mark on_update as sent in session's additional_props
            if (cdr.session_id) {
                const session = await SessionDbService.getByCpoSessionId(cdr.session_id);
                if (session) {
                await SessionDbService.update(session.id, {
                        additional_props: {
                            ...(session.additional_props as Record<string, unknown>),
                            on_update_stop_charging_sent: true,
                        },
                    });
                }
            }

            logger.debug(
                `🟢 [${authorizationReference}] Successfully sent on_update from CDR in handleOnUpdateFromCDR`,
                { data: logData }
            );
        }
        catch (e: any) {
            logger.error(
                `🔴 [${authorizationReference}] Error in handleOnUpdateFromCDR: ${e?.toString()}`,
                e,
                {
                    data: logData,
                }
            );
            // Don't throw - this is async and shouldn't block CDR processing
        }
    }
}
