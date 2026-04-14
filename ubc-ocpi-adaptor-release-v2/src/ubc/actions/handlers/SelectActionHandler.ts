/* eslint-disable @typescript-eslint/no-unused-vars */
import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { UBCSelectRequestPayload } from '../../schema/v2.0.0/actions/select/types/SelectPayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import Utils from '../../../utils/Utils';
import OnixBppController from '../../controller/OnixBppController';
import { UBCOnSelectRequestPayload } from '../../schema/v2.0.0/actions/select/types/OnSelectPayload';
import { ExtractedSelectRequestBody } from '../../schema/v2.0.0/actions/select/types/ExtractedSelectRequestBody';
import { ExtractedOnSelectResponseBody } from '../../schema/v2.0.0/actions/select/types/ExtractedOnSelectResponsePayload';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { UBCChargingMethod } from '../../schema/v2.0.0/enums/UBCChargingMethod';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import {
    BecknOrderValueResponse,
} from '../../schema/v2.0.0/types/OrderValue';
import { BecknOrderItemResponse } from '../../schema/v2.0.0/types/OrderItem';
import { EvseConnectorDbService } from '../../../db-services/EvseConnectorDbService';
import { OCPIv211PriceComponent, OCPIv211TariffElement } from '../../../ocpi/schema/modules/tariffs/types';
import { Tariff } from '@prisma/client';
import { TariffDbService } from '../../../db-services/TariffDbService';
import { LocationDbService } from '../../../db-services/LocationDbService';
import { calculateFinalAmount, buildOrderValueFromFinalAmount } from '../../utils/OrderValueCalculator';
import { ChargingMetricsUnitCode } from '../../schema/v2.0.0/enums/ChargingMetricsUnitCode';
import RazorpayPaymentGatewayService from '../../services/PaymentServices/Razorpay';
import { BuyerFinderFee } from '../../schema/v2.0.0/types/BuyerFinderFee';
import { BuyerFinderFeeEnum } from '../../schema/v2.0.0/enums/BuyerFinderFeeEnum';

/**
 * Handler for select action
 */
export default class SelectActionHandler {

    public static async handleBppSelectRequest(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCSelectRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.select, req, () => {
            SelectActionHandler.handleEVChargingUBCBppSelectAction(payload)
                .then((ubcOnSelectResponsePayload: UBCOnSelectRequestPayload) => {
                    logger.debug(`🟢 Sending select response in handleBppSelectRequest`, {
                        data: ubcOnSelectResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSelectRequest: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppSelectAction(
        reqPayload: UBCSelectRequestPayload
    ): Promise<UBCOnSelectRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'select', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppSelectAction`,
                { data: { logData, reqPayload } }
            );
            const backendSelectPayload: ExtractedSelectRequestBody =
                SelectActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending select call to backend in handleEVChargingUBCBppSelectAction`,
                { data: { backendSelectPayload } }
            );
            const ExtractedOnSelectResponseBody: ExtractedOnSelectResponseBody =
                await SelectActionHandler.sendSelectCallToBackend(backendSelectPayload);
            logger.debug(
                `🟢 [${reqId}] Received select response from backend in handleEVChargingUBCBppSelectAction`,
                { data: { ExtractedOnSelectResponseBody } }
            );

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppSelectAction`,
                { data: { reqPayload, ExtractedOnSelectResponseBody } }
            );
            const ubcOnSelectPayload: UBCOnSelectRequestPayload = SelectActionHandler.translateBackendToUBC(
                reqPayload,
                ExtractedOnSelectResponseBody
            );

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_select call to Beckn ONIX in handleEVChargingUBCBppSelectAction`,
                { data: { ubcOnSelectPayload } }
            );
            const response = await SelectActionHandler.sendOnSelectCallToBecknONIX(ubcOnSelectPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_select call to Beckn ONIX in handleEVChargingUBCBppSelectAction`,
                { data: { response } }
            );

            // return the response
            return ubcOnSelectPayload;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppSelectAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );
            throw e;
        }
    }

    public static translateUBCToBackendPayload(
        payload: UBCSelectRequestPayload
    ): ExtractedSelectRequestBody {
        const order = payload.message.order;
        const orderItem = order['beckn:orderItems'][0];
        const orderRecord = order as Record<string, unknown>;
        const buyer = orderRecord['beckn:buyer'];
        const orderAttributes = order['beckn:orderAttributes'];

        // Initialize buyer_details object
        const buyer_details: Partial<{ name?: string; phone?: string; email?: string }> = {};
        if (buyer) {
            const buyerRecord = buyer as Record<string, unknown>;
            if (buyerRecord['beckn:displayName']) {
                buyer_details.name = buyerRecord['beckn:displayName'] as string;
            }
            if (buyerRecord['beckn:telephone']) {
                buyer_details.phone = buyerRecord['beckn:telephone'] as string;
            }
            if (buyerRecord['beckn:email']) {
                buyer_details.email = buyerRecord['beckn:email'] as string;
            }
        }

        // Initialize preferences object
        const preferences: { startTime?: string; endTime?: string } = {};
        const orderAttributesRecord = orderAttributes as Record<string, unknown>;
        const preferencesObj = orderAttributesRecord?.['preferences'] as { startTime?: string; endTime?: string } | undefined;
        if (preferencesObj) {
            if (preferencesObj.startTime) {
                preferences.startTime = preferencesObj.startTime;
            }
            if (preferencesObj.endTime) {
                preferences.endTime = preferencesObj.endTime;
            }
        }

        // Initialize buyerFinderFee object
        let buyerFinderFee: BuyerFinderFee = {
            feeType: BuyerFinderFeeEnum.PERCENTAGE,
            feeValue: 0,
        };
        const buyerFinderFeeObj = orderAttributesRecord?.['buyerFinderFee'] as BuyerFinderFee | undefined;
        if (buyerFinderFeeObj) {
            buyerFinderFee = buyerFinderFeeObj;
        }


        let unitQuantity = orderItem['beckn:quantity']['unitQuantity'];
        const unitCode = orderItem['beckn:quantity']['unitCode'];

        let chargingOptionUnit = unitQuantity.toString();
        let chargingOptionType = UBCChargingMethod.Units;
        if(unitCode === ChargingMetricsUnitCode.KWH) {
            chargingOptionUnit = (unitQuantity * 1000).toString();
            chargingOptionType = UBCChargingMethod.Units;

        }

        if(unitCode === ChargingMetricsUnitCode.INR) {
            chargingOptionType = UBCChargingMethod.Amount;
        }


        const backendSelectPayload: ExtractedSelectRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                seller_id: order['beckn:seller'],
                charge_point_connector_id: orderItem['beckn:orderedItem'],
                charging_option_type: chargingOptionType,
                charging_option_unit: chargingOptionUnit,
                buyer_details: Object.keys(buyer_details).length > 0 ? buyer_details : undefined,
                preferences: Object.keys(preferences).length > 0 ? preferences : undefined,
                buyerFinderFee: Object.keys(buyerFinderFee).length > 0 ? buyerFinderFee : undefined,
            },
        };
        return backendSelectPayload;
    }

    public static async sendSelectCallToBackend(
        payload: ExtractedSelectRequestBody
    ): Promise<ExtractedOnSelectResponseBody> {
        const reqPayload = payload.payload;
        const {
            seller_id,
            charge_point_connector_id,
            charging_option_type,
            charging_option_unit,
            tariff,
            charge_point_connector_type,
            power_rating,
            buyerFinderFee,
        } = reqPayload;
        let chargingOptionUnit = Number(charging_option_unit);

        if(charging_option_type === UBCChargingMethod.Units) {
            chargingOptionUnit = Number(chargingOptionUnit)/1000; // Convert kWh to Wh
        }
        if(charging_option_type === UBCChargingMethod.Amount) {
            chargingOptionUnit = Number(chargingOptionUnit);
        }

        // Fetch connector directly from DB using beckn_connector_id
        const connectorData = await LocationDbService.getConnectorByBecknId(charge_point_connector_id);
        
        if (!connectorData) {
            throw new Error(`Connector not found for: ${charge_point_connector_id}`);
        }

        const evseConnector = connectorData.connector;

        const ocpiTariff = await TariffDbService.getByOcpiTariffId(evseConnector.tariff_ids[0]);
        if (!ocpiTariff) {
            throw new Error('Tariff not found for EVSE Connector');
        }

        const orderValue = await SelectActionHandler.buildOrderValue(ocpiTariff, chargingOptionUnit, charging_option_type, buyerFinderFee);

        const response: ExtractedOnSelectResponseBody = {
            payload: {
                connector_type: charge_point_connector_type,
                power_rating: power_rating,
                'beckn:orderValue': orderValue,
            },
            metadata: {
                domain: BecknDomain.EVChargingUBC,
            },
        };
        return response;
    }

    public static translateBackendToUBC(
        backendSelectPayload: UBCSelectRequestPayload,
        ExtractedOnSelectResponseBody: ExtractedOnSelectResponseBody
    ): UBCOnSelectRequestPayload {
        const orderValue = ExtractedOnSelectResponseBody.payload['beckn:orderValue'];
        const selectOrder = backendSelectPayload.message.order;
        const selectOrderItem = selectOrder['beckn:orderItems'][0];
        const selectAcceptedOffer = selectOrderItem['beckn:acceptedOffer'];
        const backendPayloadData = ExtractedOnSelectResponseBody.payload as Record<string, unknown>;

        const context = Utils.getBPPContext({
            ...backendSelectPayload.context,
            action: BecknAction.on_select,
        });

        // Build order item response with price
        // Per schema: on_select orderItems should NOT include beckn:lineId
        const priceFromBackend = backendPayloadData['beckn:price'];
        const priceFromOffer = selectAcceptedOffer?.['beckn:price'];
        const orderItemResponse: Record<string, unknown> = {
            'beckn:orderedItem': selectOrderItem['beckn:orderedItem'], // reuse from select
            'beckn:quantity': selectOrderItem['beckn:quantity'], // reuse from select
            'beckn:acceptedOffer': {
                ...selectAcceptedOffer, // reuse from select (includes provider field)
            },
            'beckn:price': priceFromBackend || priceFromOffer || {}, // add price
        };
        
        // Get buyer from select order (it's in the request but not in the type definition)
        // Per schema example (lines 1122-1232): on_select should NOT include beckn:id or beckn:fulfillment
        // Field order per schema: @context, @type, orderStatus, seller, buyer (REQUIRED), orderItems, orderValue, orderAttributes
        // Ensure buyer @context is main (per schema specification)
        const selectBuyer = selectOrder["beckn:buyer"] as Record<string, unknown> | undefined;
        const buyerWithMainContext = selectBuyer ? {
            ...selectBuyer,
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
        } : undefined;
        
        const ubcOnSelectPayload: UBCOnSelectRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": selectOrder["@context"],
                    "@type": selectOrder["@type"],
                    "beckn:orderStatus": OrderStatus.CREATED,
                    "beckn:seller": selectOrder["beckn:seller"],
                    "beckn:buyer": buyerWithMainContext as any, // Required per schema (lines 1127-1136), @context set to main
                    "beckn:orderItems": [orderItemResponse as any], // Cast to any since schema doesn't require lineId
                    "beckn:orderValue": orderValue,
                    "beckn:orderAttributes": selectOrder["beckn:orderAttributes"],
                    // Per schema: on_select should NOT include beckn:id or beckn:fulfillment
                },
            },
        };
        return ubcOnSelectPayload;
    }

    /**
     * Sends on_select response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnSelectCallToBecknONIX(payload: UBCOnSelectRequestPayload): Promise<any> {
        const bppHost = payload?.context?.bpp_uri || Utils.getBppUrl();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_select}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    private static async buildOrderValue(
        tariff: Tariff, 
        chargingOptionUnit: number,
        chargingOptionType: UBCChargingMethod,
        buyerFinderFee?: BuyerFinderFee,
    ): Promise<BecknOrderValueResponse> {
        const tariffElement = {
            ocpi_tariff_element: tariff.ocpi_tariff_element as any as OCPIv211TariffElement[],
            max_price: tariff.max_price,
            currency: tariff.currency,
        };
        const ocpiTariffElement = tariffElement.ocpi_tariff_element[0];
        const priceComponents = ocpiTariffElement.price_components as OCPIv211PriceComponent[];

        const partnerId = tariff.partner_id;

        const razorpayCredentials = await RazorpayPaymentGatewayService.getCredentials(partnerId);

        //************************************************uncomment it later after testing */
        // if (!razorpayCredentials) {
        //     throw new Error('Razorpay credentials not found for partner');
        // }
        // const { fee_percentage: feePercentage = 0.2} = razorpayCredentials.credentials;

// *********************************************remove below code******************************
         let feePercentage = 0.2; // default fallback

        if (!razorpayCredentials) {
             logger.warn(`⚠️ Razorpay not configured for partner ${partnerId}, skipping payment config`);

             // keep default feePercentage OR set to 0 if you want no fee
             feePercentage = 0; 
        } 
        else {
             feePercentage = razorpayCredentials.credentials?.fee_percentage ?? 0.2;
        }
       
//************************************************************************************ */

        // Calculate charging session cost excl VAT (base price only)
        let chargingSessionCostExclVat = 0;
        if(chargingOptionType === UBCChargingMethod.Units) {
            chargingSessionCostExclVat = priceComponents.reduce((acc: number, curr: OCPIv211PriceComponent) => {
                return acc + (curr.price * chargingOptionUnit);
            }, 0);
        }
        if(chargingOptionType === UBCChargingMethod.Amount) {
            chargingSessionCostExclVat = chargingOptionUnit;
        }

        // Calculate GST from VAT in price components
        // VAT is in percentage, so we calculate per component (in case different components have different VAT rates)
        // Then sum them up
        const gst = priceComponents.reduce((acc: number, curr: OCPIv211PriceComponent) => {
            const basePrice = chargingSessionCostExclVat;
            // VAT is in percentage, so: basePrice * (vat / 100)
            const vatAmount = curr.vat ? (basePrice * (curr.vat / 100)) : 0;
            return acc + vatAmount;
        }, 0);

        // Use shared logic to calculate final amount with buyer finder fee from select call
        const finalAmount = calculateFinalAmount(
            chargingSessionCostExclVat,
            gst,
            buyerFinderFee
        );

        // Build order value from final amount
        const orderValue = buildOrderValueFromFinalAmount(finalAmount, tariffElement.currency, feePercentage);
        return {
            currency: tariffElement.currency,
            value: orderValue.value,
            components: orderValue.components,
        };
    }   
}
