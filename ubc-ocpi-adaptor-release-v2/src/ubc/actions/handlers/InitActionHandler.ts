import { PaymentTxn, Prisma } from '@prisma/client';
import { Request } from 'express';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { HttpResponse } from '../../../types/responses';
import OnixBppController from '../../controller/OnixBppController';
import { UBCInitRequestPayload } from '../../schema/v2.0.0/actions/init/types/InitPayload';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { logger } from '../../../services/logger.service';
import { UBCOnInitRequestPayload } from '../../schema/v2.0.0/actions/init/types/OnInitPayload';
import BecknLogDbService from '../../../db-services/BecknLogDbService';
import {
    ExtractedInitRequestBody,
    GeneratePaymentLinkRequestPayload,
} from '../../schema/v2.0.0/actions/init/types/ExtractedInitRequestPayload';
import {
    ExtractedOnInitResponseBody,
    GeneratePaymentLinkResponsePayload,
} from '../../schema/v2.0.0/actions/init/types/ExtractedOnInitResponsePayload';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import Utils from '../../../utils/Utils';
import { AcceptedPaymentMethod } from '../../schema/v2.0.0/enums/AcceptedPaymentMethod';
import { UBCChargingMethod } from '../../schema/v2.0.0/enums/UBCChargingMethod';
import CPOBackendRequestService from '../../services/CPOBackendRequestService';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { GenericPaymentTxnStatus } from '../../../types/Payment';
import { LocationDbService } from '../../../db-services/LocationDbService';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps, PaymentServiceProvider } from '../../../types/OCPIPartner';
import PaymentGatewayService from '../../services/PaymentServices/PaymentGatewayService';
import PublishActionService from '../services/PublishActionService';
import { UBCSelectRequestPayload } from '../../schema/v2.0.0/actions/select/types/SelectPayload';
import OnStatusActionHandler from './OnStatusActionHandler';
import { CreateUPIPaymentWithRazorpayResponse } from '../../../types/Razorpay';
import {
    isUatBypassPaymentUrlForAutoStatus,
    shouldUseSyntheticRazorpayWhenNoCredentials,
} from '../../services/PaymentServices/Razorpay/razorpaySynthetic.util';
import { ChargingMetricsUnitCode } from '../../schema/v2.0.0/enums/ChargingMetricsUnitCode';
import { SessionDbService } from '../../../db-services/SessionDbService';
import { OCPISessionStatus } from '../../../ocpi/schema/modules/sessions/enums';
import { BuyerFinderFee } from '../../schema/v2.0.0/types/BuyerFinderFee';
import { BuyerFinderFeeEnum } from '../../schema/v2.0.0/enums/BuyerFinderFeeEnum';
import { BecknOrderValueComponents, GSTBreakup, PaymentBreakdown } from '../../schema/v2.0.0/types/OrderValue';
import { OrderValueComponentsType } from '../../schema/v2.0.0/enums/OrderValueComponentsType';
import { BuyerDetails } from '../../schema/v2.0.0/types/BuyerDetails';

export default class InitActionHandler {
    public static async handleBppInitAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCInitRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.init, req, () => {
            InitActionHandler.handleEVChargingUBCBppInitAction(payload)
                .then((ubcOnInitResponsePayload: UBCOnInitRequestPayload) => {
                    logger.debug(`🟢 Sending select response in handleBppSelectRequest`, {
                        data: ubcOnInitResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSelectRequest: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppInitAction(
        reqPayload: UBCInitRequestPayload
    ): Promise<UBCOnInitRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'init', messageId: reqId };

        try {
            // Determine beneficiary: if BAP sends BPP, use BPP; if BAP sends BAP, check partner config
            const bapBeneficiary = reqPayload.message?.order?.['beckn:payment']?.['beckn:beneficiary'] as 'BPP' | 'BAP' | undefined;
            let finalBeneficiary: 'BPP' | 'BAP' = 'BPP'; // Default to BPP
            
            // if (bapBeneficiary === 'BPP') {
            //     finalBeneficiary = 'BPP';
            // }
            // else if (bapBeneficiary === 'BAP') {
            //     // Get partner to check beneficiary configuration
            //     const chargePointConnectorId = reqPayload.message?.order?.['beckn:orderItems']?.[0]?.['beckn:orderedItem'];
            //     if (chargePointConnectorId) {
            //         const evse = await LocationDbService.findEVSEByBecknConnectorId(chargePointConnectorId);
            //         if (evse?.evse_connectors?.[0]?.partner_id) {
            //             const partner = await OCPIPartnerDbService.getById(evse.evse_connectors[0].partner_id);
            //             const additionalProps = partner?.additional_props as OCPIPartnerAdditionalProps | undefined;
            //             const partnerBeneficiary = additionalProps?.beneficiary;
                        
            //             if (partnerBeneficiary === 'BAP' || partnerBeneficiary === 'BPP') {
            //                 finalBeneficiary = partnerBeneficiary;
            //             }
            //         }
            //     }
            // }
            
            logger.debug(`🟡 [${reqId}] Determined beneficiary: ${finalBeneficiary}`, {
                bapBeneficiary,
                finalBeneficiary,
            });

            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppInitAction`,
                { data: { logData, reqPayload } }
            );
            const backendInitPayload: ExtractedInitRequestBody =
                InitActionHandler.translateUBCToBackendPayload(reqPayload);

            // Fetch select request to get buyerFinderFee
            const selectRequest = await InitActionHandler.fetchExistingBppSelectRequest(reqPayload.context.transaction_id);
            let buyerFinderFee: BuyerFinderFee | undefined;
            if (selectRequest) {
                const orderAttributes = selectRequest.message?.order?.['beckn:orderAttributes'];
                const orderAttributesRecord = orderAttributes as Record<string, unknown>;
                const buyerFinderFeeObj = orderAttributesRecord?.['buyerFinderFee'] as BuyerFinderFee | undefined;
                if (buyerFinderFeeObj) {
                    buyerFinderFee = {
                        feeType: buyerFinderFeeObj.feeType as BuyerFinderFeeEnum,
                        feeValue: buyerFinderFeeObj.feeValue,
                    };
                }
            }

            // Create payment txn for both BPP and BAP (BAP gets 0 rupees for consistency)
            logger.debug(
                `🟡 [${reqId}] Sending init call to backend in handleEVChargingUBCBppInitAction`,
                { data: { backendInitPayload } }
            );
            const backendOnInitResponsePayload: ExtractedOnInitResponseBody =
                await InitActionHandler.createPaymentTxnDetails(backendInitPayload, finalBeneficiary, buyerFinderFee);
            logger.debug(
                `🟢 [${reqId}] Received init response from backend in handleEVChargingUBCBppInitAction`,
                { data: { backendOnInitResponsePayload } }
            );

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppInitAction`,
                { data: { reqPayload, backendOnInitResponsePayload } }
            );
            // Get partner for settlement account
            let partner = null;
            const chargePointConnectorId = reqPayload.message?.order?.['beckn:orderItems']?.[0]?.['beckn:orderedItem'];
            if (chargePointConnectorId) {
                const connectorData = await LocationDbService.getConnectorByBecknId(chargePointConnectorId);
                if (connectorData?.connector?.partner_id) {
                    partner = await OCPIPartnerDbService.getById(connectorData.connector.partner_id);
                }
            }

            const ubcOnInitPayload: UBCOnInitRequestPayload =
                await InitActionHandler.translateBackendToUBC(reqPayload, backendOnInitResponsePayload, finalBeneficiary, partner);

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_init call to Beckn ONIX in handleEVChargingUBCBppInitAction`,
                { data: { ubcOnInitPayload } }
            );
            const response = await InitActionHandler.sendOnInitCallToBecknONIX(ubcOnInitPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_init call to Beckn ONIX in handleEVChargingUBCBppInitAction`,
                { data: { response } }
            );

            // Auto-trigger on_status COMPLETED when dummy paymentURL was used (UAT — no Razorpay configured).
            // In production, Razorpay webhook fires on_status COMPLETED automatically.
            // We build the on_status payload using ubcOnInitPayload directly (avoids DB timing race
            // since BecknLoggingService.log writes are fire-and-forget and may not be persisted yet).
            const onInitPayment = ubcOnInitPayload.message?.order?.['beckn:payment'] as Record<string, unknown> | undefined;
            const onInitPaymentURL = onInitPayment?.['beckn:paymentURL'] as string | undefined;
            const onInitTxnRef = onInitPayment?.['beckn:txnRef'] as string | undefined;
            if (isUatBypassPaymentUrlForAutoStatus(onInitPaymentURL) && onInitTxnRef) {
                const capturedTransactionId = reqPayload.context.transaction_id;
                const capturedOnInitPayload = ubcOnInitPayload;
                setImmediate(async () => {
                    try {
                        logger.debug(`🟡 [${reqId}] Dummy paymentURL — auto-sending on_status COMPLETED for UAT flow`, { data: { txnRef: onInitTxnRef } });

                        // Fetch on_select from DB (always available — logged during select flow, not fire-and-forget)
                        const existingOnSelectResponse = await OnStatusActionHandler.fetchExistingBppOnSelectResponse(capturedTransactionId);
                        if (!existingOnSelectResponse) {
                            logger.warn(`🟡 [${reqId}] No on_select found, skipping auto on_status`, { data: { txnRef: onInitTxnRef } });
                            return;
                        }

                        // Update PaymentTxn to SUCCESS
                        const paymentTxnRecord = await PaymentTxnDbService.getFirstByFilter({
                            where: { authorization_reference: onInitTxnRef },
                        });
                        if (paymentTxnRecord) {
                            await PaymentTxnDbService.update(paymentTxnRecord.id, { status: GenericPaymentTxnStatus.Success });
                        }

                        // Build on_status payload using in-memory ubcOnInitPayload — no DB fetch needed
                        const ubcOnStatusPayload = await OnStatusActionHandler.translateBackendToUBC(
                            existingOnSelectResponse,
                            capturedOnInitPayload as any,
                            {
                                authorization_reference: onInitTxnRef,
                                payment_status: BecknPaymentStatus.COMPLETED,
                                oldPaymentStatus: GenericPaymentTxnStatus.Pending,
                            },
                            capturedTransactionId
                        );

                        // Send on_status COMPLETED to BAP via ONIX
                        const bppHost = Utils.onix_bpp_caller_url();
                        await BppOnixRequestService.sendPostRequest({
                            url: `${bppHost}/${BecknAction.on_status}`,
                            data: ubcOnStatusPayload,
                        }, BecknDomain.EVChargingUBC);

                        logger.debug(`🟢 [${reqId}] Auto-sent on_status COMPLETED for dummy URL UAT flow`, { data: { txnRef: onInitTxnRef } });
                    } 
                    catch (e: any) {
                        logger.warn(`🟡 [${reqId}] Auto on_status COMPLETED failed: ${e?.message}`, { data: { txnRef: onInitTxnRef } });
                    }
                });
            }

            // Publish full partner catalog: engaged connector held 2 minutes (async, non-blocking)
            Utils.executeAsync(async () => {
                try {
                    const chargePointConnectorId = reqPayload.message?.order?.['beckn:orderItems']?.[0]?.['beckn:orderedItem'];
                    if (chargePointConnectorId) {
                        // Fetch connector directly from DB using beckn_connector_id
                        const connectorData = await LocationDbService.getConnectorByBecknId(chargePointConnectorId);
                        if (connectorData) {
                            const INIT_HOLD_SECONDS = 120; // 2 minutes — not bookable on that connector while init completes
                            await PublishActionService.publishWithReservation(
                                connectorData.connector.connector_id, // OCPI connector_id (resolves row + partner)
                                INIT_HOLD_SECONDS,
                            );
                        }
                    }

                    // Check if callback_on_status_api is enabled and send on_status after configured delay
                    // Only for BPP beneficiary (BAP handles payment in confirm)
                    if (finalBeneficiary === 'BPP') {
                        const authorizationReference = backendOnInitResponsePayload.payload.chargeTxnRef;
                        if (authorizationReference) {
                        // Get partner to check callback_on_status_api configuration
                        const chargePointConnectorId = reqPayload.message?.order?.['beckn:orderItems']?.[0]?.['beckn:orderedItem'];
                        if (chargePointConnectorId) {
                            const connectorData = await LocationDbService.getConnectorByBecknId(chargePointConnectorId);
                            if (connectorData?.connector?.partner_id) {
                                const partner = await OCPIPartnerDbService.getById(connectorData.connector.partner_id);
                                const additionalProps = partner?.additional_props as OCPIPartnerAdditionalProps | undefined;
                                const callbackConfig = additionalProps?.callback_on_status_api;

                                if (callbackConfig?.enabled && callbackConfig?.callback_time) {
                                    const callbackTimeMs = callbackConfig.callback_time * 1000; // Convert seconds to milliseconds
                                    logger.debug(`🟡 [${reqId}] Scheduling on_status callback after ${callbackConfig.callback_time} seconds`, {
                                        authorization_reference: authorizationReference,
                                        callback_time: callbackConfig.callback_time,
                                    });

                                    setTimeout(() => {
                                        logger.debug(`🟡 [${reqId}] Sending on_status call with COMPLETED payment status`, {
                                            authorization_reference: authorizationReference,
                                        });
                                        OnStatusActionHandler.sendOnStatusWithCompletedPayment(authorizationReference)
                                            .then(() => {
                                                logger.debug(`🟢 [${reqId}] Successfully sent on_status call with COMPLETED payment status`);
                                            })
                                            .catch((e: any) => {
                                                logger.error(`🔴 [${reqId}] Error sending on_status call: ${e?.toString()}`, e);
                                            });
                                    }, callbackTimeMs);
                                }
                            }
                        }
                    }
                }
                }
                catch (e: any) {
                    logger.error(`🔴 [${reqId}] Error publishing with reservation after on_init: ${e?.toString()}`, e);
                    // Don't throw - publish failures shouldn't block init
                }
            });

            return ubcOnInitPayload;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppInitAction: ${e?.toString()}`,
                e,
                {
                    data: logData,
                }
            );

            throw e;
        }
    }

    public static async fetchExistingBppOnInitResponse(
        transactionId: string
    ): Promise<UBCOnInitRequestPayload | null> {
        /**
         * If beckn transaction id is provided, check if the on init response for this transaction id is already present in the database.
         * if yes, return the response from the database. if no, then proceed to the next step.
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

    public static translateUBCToBackendPayload(
        payload: UBCInitRequestPayload
    ): ExtractedInitRequestBody {
        const buyer = payload.message.order['beckn:buyer'];
        const orderItem = payload.message.order['beckn:orderItems'][0];

        let unitQuantity = orderItem['beckn:quantity']?.['unitQuantity'] ?? 0;
        const unitCode = orderItem['beckn:quantity']?.['unitCode'];

        let chargingOptionUnit = unitQuantity?.toString();
        let chargingOptionType = UBCChargingMethod.Units;
        if(unitCode && unitCode === ChargingMetricsUnitCode.KWH) {
            chargingOptionUnit = (unitQuantity * 1000).toString();
            chargingOptionType = UBCChargingMethod.Units;

        }

        if(unitCode === ChargingMetricsUnitCode.INR) {
            chargingOptionType = UBCChargingMethod.Amount;
            chargingOptionUnit = unitQuantity.toString();
        }
        
        const backendInitPayload: ExtractedInitRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                amount: payload.message.order['beckn:orderValue']['value'],
                orderValueComponents: payload.message.order['beckn:orderValue']['components'],
                charge_point_connector_id: orderItem['beckn:orderedItem'],
                charging_option_type: chargingOptionType,
                charging_option_unit: chargingOptionUnit,
                buyer_details: {
                    id: buyer['beckn:id'],
                    name: buyer['beckn:displayName'], // v0.9: renamed from beckn:name
                    address: buyer['beckn:address'],
                    email: buyer['beckn:email'],
                    phone: buyer['beckn:telephone'], // v0.9: renamed from beckn:phone
                    tax_id: buyer['beckn:taxID'], // v0.9: renamed from beckn:taxId
                    organization_name:
                        buyer['beckn:organization']?.['descriptor']?.['name'],
                } as BuyerDetails,
            },
        };
        return backendInitPayload;
    }

    public static async fetchExistingBppSelectRequest(transactionId: string): Promise<UBCSelectRequestPayload | null> {
        /**
         * Fetch existing select request for this transaction id
         */
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.in.request.${BecknAction.select}`,
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
            return becknLogs.records[0].payload as UBCSelectRequestPayload;
        }

        return null;
    }

    public static async createPaymentTxnDetails(
        payload: ExtractedInitRequestBody,
        beneficiary: 'BPP' | 'BAP',
        buyerFinderFee?: { feeType?: string; feeValue?: number },
    ): Promise<ExtractedOnInitResponseBody> {
        const finalAmount = payload.payload.amount;
        
        // Fetch connector directly from DB using beckn_connector_id
        const connectorData = await LocationDbService.getConnectorByBecknId(payload.payload.charge_point_connector_id);
        
        if (!connectorData) {
            throw new Error(`Connector not found for ID: ${payload.payload.charge_point_connector_id}`);
        }

        const evseConnector = connectorData.connector;
        
        if (!evseConnector.partner_id) {
            throw new Error(`Connector ${payload.payload.charge_point_connector_id} does not have a partner_id`);
        }
        
        // Verify the partner exists
        const partner = await OCPIPartnerDbService.getById(evseConnector.partner_id);
        if (!partner) {
            throw new Error(`Partner not found for partner_id: ${evseConnector.partner_id}`);
        }
        
        const authorizationReference = Utils.generateUUID();
        const paymentStatus = BecknPaymentStatus.INITIATED;
        const orderValueComponents = payload.payload.orderValueComponents;
        
        // Extract buyer finder fee from select request and prepare service_charge
        const serviceCharge: { buyer_finder_fee?: BuyerFinderFee; network_fee?: number } = {};
        if (buyerFinderFee) {
            serviceCharge.buyer_finder_fee = {
                feeType: buyerFinderFee.feeType as BuyerFinderFeeEnum,
                feeValue: buyerFinderFee.feeValue ?? 0,
            };
        }

        const gstBreakup = InitActionHandler.buildGSTBreakup(orderValueComponents);
        // network_fee defaults to 0.3, but we can set it here if needed in the future
        
        const paymentTxnData: Prisma.PaymentTxnUncheckedCreateInput = {
            authorization_reference: authorizationReference,
            amount: finalAmount,
            payment_link: '',
            payment_breakdown: {
                total: finalAmount,
                breakdown: orderValueComponents,
                gst_breakup: gstBreakup,
            } as PaymentBreakdown,
            status: paymentStatus,
            requested_energy_units: payload.payload.charging_option_unit,
            partner_id: evseConnector.partner_id,
            beckn_transaction_id: payload.metadata.beckn_transaction_id,
            beneficiary: beneficiary,
            service_charge: serviceCharge,
        };
        const paymentTxn = await PaymentTxnDbService.create({
            data: paymentTxnData,
        });

        let paymentLink = '';
        if (beneficiary === 'BPP') {
            try {
                const generatePaymentLinkResponse = await InitActionHandler.generatePaymentLink(
                    {
                        amount: finalAmount,
                        authorization_reference: authorizationReference,
                    },
                    paymentTxn,
                    payload?.payload?.buyer_details as BuyerDetails
                );

                await PaymentTxnDbService.update(paymentTxn.id, {
                    payment_link: generatePaymentLinkResponse.payment_link,
                    authorization_reference: generatePaymentLinkResponse.authorization_reference,
                });

                paymentLink = generatePaymentLinkResponse.payment_link;
            }
            catch (e: any) {
                logger.warn(
                    `🟡 Payment link generation failed for partner ${evseConnector.partner_id}, using dummy paymentURL: ${e?.message}`,
                    { data: { partner_id: evseConnector.partner_id, authorization_reference: authorizationReference } }
                );
                // Dummy URL so BAP frontend doesn't error on empty paymentURL during UAT testing
                paymentLink = `https://pay.ubc.test/upi?ref=${authorizationReference}`;
            }
        }

        const extractedOnInitResponseBody: ExtractedOnInitResponseBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
            },
            payload: {
                becknPaymentId: paymentTxn.id,
                paymentLink: paymentLink,
                chargeTxnRef: paymentTxn.authorization_reference,
                beneficiary: 'BPP', // Payment txn is only created for BPP beneficiary
                paymentStatus: paymentStatus,
                becknOrderId: paymentTxn.authorization_reference,
                amount: finalAmount,
            },
        };

        const sessionData: Prisma.SessionUncheckedCreateInput = {
            country_code: 'IN',
            partner_id: evseConnector.partner_id ?? '',
            location_id: connectorData.location.ocpi_location_id,
            evse_uid: connectorData.evse.uid,
            connector_id: connectorData.connector.connector_id,
            authorization_reference: paymentTxn.authorization_reference,
            requested_energy_units: paymentTxn.requested_energy_units,
            status: OCPISessionStatus.PENDING,
            buyer_info: payload?.payload?.buyer_details as BuyerDetails,
        };
        
        await SessionDbService.create({
            data: sessionData,
        });

        return extractedOnInitResponseBody;
    }

    public static async generatePaymentLink(
        payload: GeneratePaymentLinkRequestPayload,
        paymentTxn: PaymentTxn,
        buyerDetails?: BuyerDetails
    ): Promise<GeneratePaymentLinkResponsePayload> {
        const ocpiPartner = await OCPIPartnerDbService.getById(paymentTxn.partner_id);
        if (!ocpiPartner) {
            throw new Error('OCPI partner not found');
        }
        const ocpiPartnerAdditionalProps =
            ocpiPartner?.additional_props as OCPIPartnerAdditionalProps;
        
        if (ocpiPartnerAdditionalProps?.payment_service_provider === PaymentServiceProvider.CPO) {
            return await this.sendGeneratePaymentLinkCallToBackend(payload, paymentTxn.partner_id);
        }
        else {
            const paymentGatewayOrder = await PaymentGatewayService.createPaymentGatewayOrder(paymentTxn, ocpiPartner, buyerDetails) as CreateUPIPaymentWithRazorpayResponse;

            let payment_link = paymentGatewayOrder.payment?.link || '';
            if (!payment_link && shouldUseSyntheticRazorpayWhenNoCredentials()) {
                payment_link = `https://pay.ubc.test/upi?ref=${encodeURIComponent(paymentTxn.authorization_reference || paymentTxn.id)}`;
                logger.warn('Payment gateway returned no UPI link — using UAT dummy paymentURL (test mode)', {
                    data: { partner_id: paymentTxn.partner_id, payment_txn_id: paymentTxn.id },
                });
            }

            return {
                payment_link,
                authorization_reference: paymentTxn.authorization_reference,
            };
        }
    }

    public static async sendGeneratePaymentLinkCallToBackend(
        payload: GeneratePaymentLinkRequestPayload,
        partnerId: string
    ): Promise<GeneratePaymentLinkResponsePayload> {

        const ocpiPartner = await OCPIPartnerDbService.getById(partnerId);
        const ocpiPartnerAdditionalProps =
            ocpiPartner?.additional_props as OCPIPartnerAdditionalProps;
        const generatePaymentLink =
            ocpiPartnerAdditionalProps?.communication_urls?.generate_payment_link;
        if (!generatePaymentLink) {
            throw new Error('Generate payment link endpoint not found');
        }
        const generatePaymentLinkUrl = generatePaymentLink.url;
        const generatePaymentLinkAuthToken = generatePaymentLink.auth_token;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (generatePaymentLinkAuthToken) {
            headers['Authorization'] = `${generatePaymentLinkAuthToken}`;
        }
        const response = await CPOBackendRequestService.sendPostRequest({
            url: generatePaymentLinkUrl,
            data: payload,
            headers: headers,
        });
        
        return response.data as GeneratePaymentLinkResponsePayload;
    }

    public static async translateBackendToUBC(
        backendInitPayload: UBCInitRequestPayload,
        backendOnInitResponsePayload: ExtractedOnInitResponseBody,
        beneficiary?: 'BPP' | 'BAP',
        partner?: { additional_props: unknown } | null
    ): Promise<UBCOnInitRequestPayload> {
        const context = Utils.getBPPContext({
            ...backendInitPayload.context,
            action: BecknAction.on_init,
        });

        const initOrder = backendInitPayload.message.order;
        const finalBeneficiary = beneficiary ?? backendOnInitResponsePayload.payload.beneficiary ?? 'BPP';
        const bppId = Utils.getBppId();

        // Build settlementAccounts array - include BAP from init request and BPP from partner config
        const initPaymentAttributes = initOrder['beckn:payment']?.['beckn:paymentAttributes'] as Record<string, unknown> | undefined;
        const initSettlementAccounts = initPaymentAttributes?.['settlementAccounts'] as Array<Record<string, unknown>> | undefined || [];

        // Add BPP settlement account from partner config
        if (partner && bppId) {
            const additionalProps = partner.additional_props as OCPIPartnerAdditionalProps | undefined;
            const bppSettlementAccount = additionalProps?.settlement_account;
            if (bppSettlementAccount) {
                initSettlementAccounts.push({
                    beneficiaryId: bppId,
                    accountHolderName: bppSettlementAccount.accountHolderName,
                    accountNumber: bppSettlementAccount.accountNumber,
                    ifscCode: bppSettlementAccount.ifscCode,
                    bankName: bppSettlementAccount.bankName,
                    vpa: bppSettlementAccount.vpa,
                });
            }
        }

        const settlementAccounts = initSettlementAccounts;

        // Build paymentAttributes
        const paymentAttributes: Record<string, unknown> = {};
        if (initPaymentAttributes) {
            paymentAttributes['@context'] = initPaymentAttributes['@context'] || "https://raw.githubusercontent.com/bhim/ubc-tsd/main/beckn-schemas/UBCExtensions/v1/context.jsonld";
            paymentAttributes['@type'] = initPaymentAttributes['@type'] || "UBCPaymentAttributes";
            
            // Include upiTransactionId if present
            if (initPaymentAttributes['upiTransactionId']) {
                paymentAttributes['upiTransactionId'] = initPaymentAttributes['upiTransactionId'];
            }
        }
        else {
            paymentAttributes['@context'] = "https://raw.githubusercontent.com/bhim/ubc-tsd/main/beckn-schemas/UBCExtensions/v1/context.jsonld";
            paymentAttributes['@type'] = "UBCPaymentAttributes";
        }

        // Include settlementAccounts if any are present
        if (settlementAccounts.length > 0) {
            paymentAttributes['settlementAccounts'] = settlementAccounts;
        }

        // v0.9: OnInit response - removed orderNumber, orderAttributes, fulfillment
        // v0.9: Added beckn:id (order id), full payment with paymentURL, txnRef, acceptedPaymentMethod
        // Build payment object - conditionally include paymentURL, txnRef, acceptedPaymentMethod only for BPP
        // Always use payment amount from init order to ensure consistency
        const initPayment = initOrder['beckn:payment'] as Record<string, unknown> | undefined;
        const initPaymentAmount = initPayment?.['beckn:amount'] as { currency?: string; value?: number } | undefined;
        const paymentAmount = initPaymentAmount?.value ?? (initOrder['beckn:orderValue']?.['value'] as number | undefined);
        
        const paymentObject: any = {
            '@context':
                'https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld',
            '@type': ObjectType.payment,
            'beckn:id': backendOnInitResponsePayload.payload.becknPaymentId || Utils.generateUUID(),
            'beckn:amount': {
                currency: 'INR',
                value: paymentAmount,
            },
            'beckn:beneficiary': finalBeneficiary,
            'beckn:paymentStatus': backendOnInitResponsePayload.payload.paymentStatus,
            // v0.9: paymentAttributes with settlementAccounts (BAP from init request, BPP from partner config)
            'beckn:paymentAttributes': Object.keys(paymentAttributes).length > 0 ? paymentAttributes : undefined,
        };

        // Only include paymentURL, txnRef, acceptedPaymentMethod for BPP beneficiary
        if (finalBeneficiary === 'BPP') {
            paymentObject['beckn:paymentURL'] = backendOnInitResponsePayload.payload.paymentLink;
            paymentObject['beckn:txnRef'] = backendOnInitResponsePayload.payload.chargeTxnRef;
            paymentObject['beckn:acceptedPaymentMethod'] = [
                AcceptedPaymentMethod.BANK_TRANSFER,
                AcceptedPaymentMethod.UPI,
                AcceptedPaymentMethod.WALLET,
            ];
        }

        const ubcOnInitPayload: UBCOnInitRequestPayload = {
            context: context,
            message: {
                order: {
                    '@context': initOrder['@context'],
                    '@type': initOrder['@type'],
                    'beckn:id': backendOnInitResponsePayload.payload.becknOrderId, // v0.9: order id assigned by BPP
                    'beckn:orderStatus': initOrder['beckn:orderStatus'],
                    'beckn:seller': initOrder['beckn:seller'],
                    'beckn:buyer': initOrder['beckn:buyer'],
                    'beckn:orderItems': initOrder['beckn:orderItems'],
                    'beckn:orderValue': initOrder['beckn:orderValue'],
                    'beckn:payment': paymentObject,
                },
            },
        };
        return ubcOnInitPayload;
    }

    /**
     * Sends on_select response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnInitCallToBecknONIX(payload: UBCOnInitRequestPayload): Promise<any> {
        const bppHost = Utils.onix_bpp_caller_url();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_init}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    /**
     * Constructs and sends an error on_init response when processing fails.
     *
     * This function is called when an error occurs during the init action processing (e.g., backend call fails).
     * Instead of leaving the BAP side waiting indefinitely for a response, we send back the original request
     * payload with only the action changed to 'on_init'. This ensures:
     * 1. The BAP side receives a response and can resolve the stitched response
     * 2. The request doesn't get stuck in REQUESTS_STORE waiting for a callback
     * 3. The BAP can handle the error appropriately
     *
     * The error response flows: BPP → BPP ONIX → BAP ONIX → BAP → onActionsWrapper → resolveStitchedResponse
     *
     * @param originalRequest - The original init request payload received from BAP
     * @param error - The error that occurred during processing
     */
    static async sendErrorOnInitResponse(
        originalRequest: UBCInitRequestPayload,
        error: Error
    ): Promise<void> {
        // Create new context with action changed to 'on_init' (response action)
        const context = Utils.getBPPContext({
            ...originalRequest.context,
            action: BecknAction.on_init,
        });

        // Send back the same request payload, just change the action in context
        // This allows BAP to resolve the stitched response even on error
        const errorOnInitPayload = {
            context: context,
            message: originalRequest.message,
        } as unknown as UBCOnInitRequestPayload;

        logger.debug(`🟡 Sending error on_init response due to processing failure`, {
            data: {
                messageId: context.message_id,
                error: error.message,
            },
        });

        // Send the error response to BPP ONIX, which will forward it to BAP
        await this.sendOnInitCallToBecknONIX(errorOnInitPayload);
    }

    static buildGSTBreakup(orderValueComponents: BecknOrderValueComponents[]): GSTBreakup {
        const gstBreakup: GSTBreakup = {};
        const gstOnChargingSessionCost = (orderValueComponents.find(component => component.type === OrderValueComponentsType.UNIT && component.description === 'Charging session cost')?.value ?? 0);
        const gstOnPgProcessingFee = orderValueComponents.find(component => component.type === OrderValueComponentsType.FEE && component.description === 'Payment processing fee')?.value || 0;
        const gstOnBuyerFinderFee = orderValueComponents.find(component => component.type === OrderValueComponentsType.FEE && component.description === 'Buyer finder fee')?.value || 0;
        const gstOnNetworkFinderFee = orderValueComponents.find(component => component.type === OrderValueComponentsType.FEE && component.description === 'Network finder fee')?.value || 0;
        gstBreakup.charging_session_cost = Number(gstOnChargingSessionCost.toFixed(2));
        gstBreakup.gst_on_pg_processing_fee = Number(gstOnPgProcessingFee.toFixed(2));
        gstBreakup.gst_on_buyer_finder_fee = Number(gstOnBuyerFinderFee.toFixed(2));
        gstBreakup.gst_on_network_finder_fee = Number(gstOnNetworkFinderFee.toFixed(2));
        return gstBreakup;
    }
}
