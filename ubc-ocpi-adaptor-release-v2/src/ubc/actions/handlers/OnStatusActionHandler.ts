import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import Utils from "../../../utils/Utils";
import BppOnixRequestService from "../../services/BppOnixRequestService";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import { ExtractedOnStatusRequestBody } from "../../schema/v2.0.0/actions/status/types/ExtractedOnStatusRequestPayload";
import { UBCOnStatusRequestPayload } from "../../schema/v2.0.0/actions/status/types/OnStatusPayload";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import InitActionHandler from "./InitActionHandler";
import { UBCOnSelectRequestPayload } from "../../schema/v2.0.0/actions/select/types/OnSelectPayload";
import { UBCOnInitRequestPayload } from "../../schema/v2.0.0/actions/init/types/OnInitPayload";
import { OrderStatus } from "../../schema/v2.0.0/enums/OrderStatus";
import { ObjectType } from "../../schema/v2.0.0/enums/ObjectType";
import { BecknPayment } from "../../schema/v2.0.0/types/Payment";
import PaymentTxnDbService from "../../../db-services/PaymentTxnDbService";
import BecknLogDbService from "../../../db-services/BecknLogDbService";
import { Prisma } from "@prisma/client";
import { GenericPaymentTxnStatus } from "../../../types/Payment";
import { BecknPaymentStatus } from "../../schema/v2.0.0/enums/PaymentStatus";
import { mapGenericToBecknStatus } from "../../services/PaymentServices/Razorpay/RazorpayPaymentService";

/**
 * Handler for status action
 */
export default class OnStatusActionHandler {
    public static async handleBppOnStatusRequest(reqDetails: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            logger.debug(`🟡 Received on_status request in handleBppOnStatusRequest`, { data: reqDetails });

            const body = reqDetails.body as ExtractedOnStatusRequestBody;

            // Forward on_status to BPP ONIX (no response needed as request comes from backend)
            await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction(body);


            logger.debug(`🟢 Sending on_status response in handleBppOnStatusRequest`, { data: {} });

            return UBCResponseService.ack();
        }
        catch (e: any) {
            logger.error(`🔴 Error in handleBppOnStatusRequest`, e, {
                data: { message: 'Something went wrong' },
            });

            return UBCResponseService.nack();
        }
    }

    public static async handleEVChargingUBCBppOnStatusAction(reqPayload: ExtractedOnStatusRequestBody): Promise<void> {
        const { authorization_reference } = reqPayload;
        const logData = { action: 'on_status', authorization_reference: authorization_reference };

        try {
            // Forward on_status to BPP ONIX
            logger.debug(`🟡 [${authorization_reference}] Forwarding on_status to BPP ONIX in handleEVChargingUBCBppOnStatusAction`, { data: { logData, reqPayload } });
            const response = await OnStatusActionHandler.forwardOnStatusToBppOnix(reqPayload);
            logger.debug(`🟢 [${authorization_reference}] Forwarded on_status to BPP ONIX in handleEVChargingUBCBppOnStatusAction`, { data: { response } });
        }
        catch (e: any) {
            logger.error(`🔴 [${authorization_reference}] Error in OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction: ${e?.toString()}`, e, {
                data: { logData },
            });
            throw e;
        }
    }

    /**
     * Reusable function to send on_status with COMPLETED payment status
     * Updates payment transaction status to COMPLETED and forwards on_status to BPP ONIX
     * @param authorization_reference - Payment transaction authorization reference
     * @param oldPaymentStatus - Optional old payment status (defaults to PENDING)
     */
    public static async sendOnStatusWithCompletedPayment(
        authorization_reference: string,
        oldPaymentStatus?: GenericPaymentTxnStatus
    ): Promise<void> {
        try {
            logger.info('Sending on_status with COMPLETED payment status', {
                authorization_reference,
                oldPaymentStatus,
            });

            // Update payment status to COMPLETED
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorization_reference,
                },
            });

            if (!paymentTxn) {
                throw new Error(`Payment transaction not found for authorization_reference: ${authorization_reference}`);
            }

            // Update payment status to COMPLETED
            await PaymentTxnDbService.update(paymentTxn.id, {
                status: GenericPaymentTxnStatus.Success,
            });

            logger.info('Updated payment status to COMPLETED', {
                paymentTxnId: paymentTxn.id,
                authorization_reference,
            });

            // Send on_status with COMPLETED payment status
            await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction({
                authorization_reference: authorization_reference,
                payment_status: BecknPaymentStatus.COMPLETED,
                oldPaymentStatus: oldPaymentStatus || GenericPaymentTxnStatus.Pending,
            });

            logger.info('Successfully sent on_status with COMPLETED payment status', {
                authorization_reference,
            });
        }
        catch (error: unknown) {
            // Log error but don't fail - status update was already done
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error('Failed to send on_status with COMPLETED payment status', err, {
                authorization_reference,
            });
        }
    }

    /**
     * Translates backend async on_status payload to UBC format
     * This is for UNSOLICITED on_status sent by BPP (without preceding status request)
     * According to schema: formulate using data from on_select and on_init
     * - orderStatus: PENDING
     * - orderItems: simplified (with quantity and price from on_select)
     * - orderValue: from on_select
     * - payment: from on_init with updated paymentStatus
     * - order id: from on_init
     * - buyer, seller: from on_select
     * - fulfillment: includes connectorStatus from EVSE table
     */
    public static async translateBackendToUBC(
        existingOnSelectResponse: UBCOnSelectRequestPayload,
        existingOnInitResponse: UBCOnInitRequestPayload,
        backendOnStatusRequestPayload: ExtractedOnStatusRequestBody,
        transactionId: string,
        amount?: number
    ): Promise<UBCOnStatusRequestPayload> {
        const selectOrder = existingOnSelectResponse.message.order;
        const initOrder = existingOnInitResponse.message.order;
        const initPayment = initOrder['beckn:payment'];

        // Generate new context for async on_status
        const context = Utils.getBPPContext({
            domain: BecknDomain.EVChargingUBC,
            action: BecknAction.on_status,
            version: '2.0.0',
            transaction_id: transactionId,
            message_id: Utils.generateUUID(), // Generate new message_id for async callback
            bap_id: existingOnInitResponse.context.bap_id,
            bap_uri: existingOnInitResponse.context.bap_uri,
            bpp_id: existingOnInitResponse.context.bpp_id,
            bpp_uri: existingOnInitResponse.context.bpp_uri,
        });

        // Build orderItems with full details (orderedItem, quantity, price) per example schema
        const selectOrderItems = selectOrder['beckn:orderItems'] as Record<string, unknown>[];
        const orderItems = selectOrderItems.map(item => ({
            "beckn:orderedItem": item['beckn:orderedItem'] as string,
            "beckn:quantity": item['beckn:quantity'] as Record<string, unknown>,
            "beckn:price": item['beckn:price'] as Record<string, unknown>,
        }));

        // Build payment object with all fields per example schema
        const initPaymentData = initPayment as Record<string, unknown>;
        const beneficiary = (initPaymentData['beckn:beneficiary'] as string) || 'BPP';
        const becknAmount = amount ? {
            currency: 'INR',
            value: amount,
        } : initPaymentData['beckn:amount'] as BecknPayment['beckn:amount'];
        const paymentObject: Partial<BecknPayment> = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
            "@type": ObjectType.payment,
            "beckn:id": initPaymentData['beckn:id'] as string,
            "beckn:amount": becknAmount,
            "beckn:beneficiary": beneficiary,
            "beckn:paymentStatus": backendOnStatusRequestPayload.payment_status as BecknPaymentStatus,
        };

        // Only include paymentURL and txnRef for BPP beneficiary (per init logic)
        if (beneficiary === 'BPP') {
            if (initPaymentData['beckn:paymentURL']) {
                paymentObject['beckn:paymentURL'] = initPaymentData['beckn:paymentURL'] as string;
            }
            if (initPaymentData['beckn:txnRef']) {
                paymentObject['beckn:txnRef'] = initPaymentData['beckn:txnRef'] as string;
            }
        }

        // Add paidAt when paymentStatus is COMPLETED (per example schema)
        if (backendOnStatusRequestPayload.payment_status === BecknPaymentStatus.COMPLETED) {
            paymentObject['beckn:paidAt'] = new Date().toISOString();
        }
        else if (initPaymentData['beckn:paidAt']) {
            // Use existing paidAt if present
            paymentObject['beckn:paidAt'] = initPaymentData['beckn:paidAt'] as string;
        }

        // Include paymentAttributes if present (per example schema)
        // Only include upiTransactionId, exclude settlementAccounts (not in example schema for on_status)
        const initPaymentAttributes = initPaymentData['beckn:paymentAttributes'] as Record<string, unknown> | undefined;
        if (initPaymentAttributes) {
            const paymentAttributes: Record<string, unknown> = {
                "@context": initPaymentAttributes['@context'] || "https://raw.githubusercontent.com/bhim/ubc-tsd/main/beckn-schemas/UBCExtensions/v1/context.jsonld",
                "@type": initPaymentAttributes['@type'] || "UBCPaymentAttributes",
            };

            // Only include upiTransactionId if present (per example schema)
            if (initPaymentAttributes['upiTransactionId']) {
                paymentAttributes['upiTransactionId'] = initPaymentAttributes['upiTransactionId'];
            }

            // Only include paymentAttributes if it has upiTransactionId
            if (paymentAttributes['upiTransactionId']) {
                paymentObject['beckn:paymentAttributes'] = paymentAttributes as BecknPayment['beckn:paymentAttributes'];
            }
        }

        // Include full buyer details per example schema (not just id)
        // Ensure buyer @context is main (per schema specification)
        const selectBuyer = selectOrder['beckn:buyer'] as Record<string, unknown> | undefined;
        const fullBuyer = selectBuyer ? {
            ...selectBuyer,
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
        } : {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
            "@type": "beckn:Buyer",
            "beckn:id": "", // Fallback if buyer not found
        };

        const ubcOnStatusPayload: UBCOnStatusRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": initOrder['@context'],
                    "@type": ObjectType.order,
                    "beckn:id": initOrder['beckn:id'], // from on_init
                    "beckn:orderStatus": OrderStatus.PENDING, // Can be PENDING or INPROGRESS per schema
                    "beckn:seller": selectOrder['beckn:seller'], // from on_select
                    "beckn:buyer": fullBuyer as any, // Full buyer details per example schema
                    "beckn:orderItems": orderItems as any, // Full orderItems (orderedItem, quantity, price) per example schema
                    "beckn:orderValue": selectOrder['beckn:orderValue'], // from on_select
                    // Note: fulfillment is NOT included in on_status per example schema (06_on_status_1)
                    "beckn:payment": paymentObject as BecknPayment, // from on_init with updated paymentStatus
                },
            },
        };

        return ubcOnStatusPayload;
    }

    /**
     * Receives ASYNC/UNSOLICITED on_status from backend and forwards to BPP ONIX
     * This is for cases like charging interruptions, payment completion, etc.
     * Backend → BPP Provider → BPP ONIX → BAP
     * 
     * No preceding status request is required - this is an independent callback
     */
    public static async forwardOnStatusToBppOnix(payload: ExtractedOnStatusRequestBody): Promise<void> {
        const { authorization_reference, payment_status, oldPaymentStatus, amount } = payload;

        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                authorization_reference: authorization_reference,
            },
        });

        if (!paymentTxn) {
            throw new Error('No payment txn found');
        }

        logger.debug(`🟡 [${authorization_reference}] Payment txn found`, { paymentTxn });

        const paymentStatus = mapGenericToBecknStatus(paymentTxn.status);
        
        if (oldPaymentStatus !== (paymentStatus as unknown as GenericPaymentTxnStatus)) {
            const becknTransactionId = paymentTxn.beckn_transaction_id;

            // Fetch existing responses to formulate on_status payload
            const existingBppOnSelectResponse = await OnStatusActionHandler.fetchExistingBppOnSelectResponse(becknTransactionId);
            const existingBppOnInitResponse = await InitActionHandler.fetchExistingBppOnInitResponse(becknTransactionId);

            if (!existingBppOnSelectResponse) {
                throw new Error('No existing on_select response found');
            }

            if (!existingBppOnInitResponse) {
                throw new Error('No existing on_init response found');
            }

            // Update payment status in database
            await PaymentTxnDbService.update(paymentTxn.id, {
                status: payment_status,
            });

            logger.debug(`🟡 [${authorization_reference}] Updated payment status to`, { paymentTxnId: paymentTxn.id, payment_status });

            const becknPaymentStatus = payment_status as BecknPaymentStatus;
            if (!becknPaymentStatus) {
                throw new Error('Invalid payment status');
            }

            // v0.9: Use type assertion since on_init structure changed but we still need to build on_status from it
            // Convert backend payload to UBC format (no status request needed for async on_status)
            const ubcOnStatusPayload = await this.translateBackendToUBC(
                existingBppOnSelectResponse,
                existingBppOnInitResponse,
                {
                    ...payload,
                    payment_status: becknPaymentStatus,
                },
                becknTransactionId,
                amount
            );

            const bppHost = Utils.getBPPClientHost();
            
            logger.debug(`🟡 [${authorization_reference}] Translating backend to UBC format: `, { bppHost, ubcOnStatusPayload });

            return await BppOnixRequestService.sendPostRequest({
                url: `${bppHost}/${BecknAction.on_status}`,
                data: ubcOnStatusPayload,
            }, BecknDomain.EVChargingUBC);
        }
        else {
            logger.debug(`🟡 [${authorization_reference}] Payment status not changed`, { paymentStatus, oldPaymentStatus });
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
}

