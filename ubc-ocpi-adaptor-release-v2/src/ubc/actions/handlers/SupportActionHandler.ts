import { Request } from "express";
import { Prisma } from "@prisma/client";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import { UBCSupportRequestPayload } from "../../schema/v2.0.0/actions/support/types/SupportPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import OnixBppController from "../../controller/OnixBppController";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import { UBCOnSupportRequestPayload } from "../../schema/v2.0.0/actions/support/types/OnSupportPayload";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import BppOnixRequestService from "../../services/BppOnixRequestService";
import Utils from "../../../utils/Utils";
import { ExtractedOnSupportResponsePayload } from "../../schema/v2.0.0/actions/support/types/ExtractedOnSupportResponsePayload";
import { ExtractedSupportRequestPayload } from "../../schema/v2.0.0/actions/support/types/ExtractedSupportRequestPayload";
import OCPIPartnerDbService from "../../../db-services/OCPIPartnerDbService";
import { OCPIPartnerAdditionalProps } from "../../../types/OCPIPartner";
import { SessionDbService } from "../../../db-services/SessionDbService";
import UBCResponseService from "../../services/UBCResponseService";
import { Support } from "../../schema/v2.0.0/types/Support";

/**
 * Handler for support action
 */
export default class SupportActionHandler {
    public static async handleBppSupportRequest(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCSupportRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.support, req, () => {
            SupportActionHandler.handleEVChargingUBCBppSupportAction(payload)
                .then((ubcOnSupportResponsePayload: UBCOnSupportRequestPayload) => {
                    logger.debug(`🟢 Sending support response in handleBppSupportRequest`, {
                        data: ubcOnSupportResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSupportRequest: 'Something went wrong'`, e);
                    SupportActionHandler.sendErrorOnSupportResponse(payload, e);
                });
        });
    }

    public static async handleEVChargingUBCBppSupportAction(reqPayload: UBCSupportRequestPayload): Promise<UBCOnSupportRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'support', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(`🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppSupportAction`, { data: { logData, reqPayload } });
            const backendSupportPayload = SupportActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(`🟡 [${reqId}] Sending support call to backend in handleEVChargingUBCBppSupportAction`, { data: { backendSupportPayload } });
            const backendOnSupportResponsePayload = await SupportActionHandler.sendSupportCallToBackend(backendSupportPayload);
            logger.debug(`🟢 [${reqId}] Received support response from backend in handleEVChargingUBCBppSupportAction`, { data: { backendOnSupportResponsePayload } });

            // translate CPO's BE Server response to UBC Schema
            logger.debug(`🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppSupportAction`, { data: { reqPayload, backendOnSupportResponsePayload } });
            const ubcOnSupportPayload: UBCOnSupportRequestPayload = SupportActionHandler.translateBackendToUBC(reqPayload, backendOnSupportResponsePayload);

            // Call BAP on_support
            logger.debug(`🟡 [${reqId}] Sending on_support call to Beckn ONIX in handleEVChargingUBCBppSupportAction`, { data: { ubcOnSupportPayload } });
            const response = await SupportActionHandler.sendOnSupportCallToBecknONIX(ubcOnSupportPayload);
            logger.debug(`🟢 [${reqId}] Sent on_support call to Beckn ONIX in handleEVChargingUBCBppSupportAction`, { data: { response } });

            // return the response
            return ubcOnSupportPayload;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleEVChargingUBCBppSupportAction: ${e?.toString()}`, e, {
                data: { logData },
            });
        
            
            throw e;
        }
    }

    /**
         * Translates UBC (Beckn) request payload to backend format
         */
    public static translateUBCToBackendPayload(payload: UBCSupportRequestPayload): ExtractedSupportRequestPayload {
        // v0.9: Support request uses refId/refType (camelCase) and includes support object with user's contact info
        const backendSupportPayload: ExtractedSupportRequestPayload = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id ?? '',
                bpp_uri: payload.context.bpp_uri ?? '',
                beckn_transaction_id: payload.context.transaction_id,
            },
            payload: {
                reference_id: payload.message.refId, // v0.9: renamed from ref_id
                reference_type: payload.message.refType, // v0.9: renamed from ref_type
                // v0.9: User's contact info for support
                user_support_info: payload.message.support ? {
                    name: payload.message.support.name,
                    phone: payload.message.support.phone,
                    email: payload.message.support.email,
                    hours: payload.message.support.hours,
                    channels: payload.message.support.channels,
                } : undefined,
            },
        };
        return backendSupportPayload;
    }

    /**
     * Sends support request to backend (pulse-central)
     */
    public static async sendSupportCallToBackend(
        payload: ExtractedSupportRequestPayload
    ): Promise<ExtractedOnSupportResponsePayload> {
        const session = await SessionDbService.getByAuthorizationReference(payload.payload.reference_id);
        const partner = await OCPIPartnerDbService.getById(session?.partner_id ?? '');

        if (!partner) {
            throw new Error('Partner not found');
        }

        const partnerAdditionalProps = partner.additional_props as OCPIPartnerAdditionalProps;

        if (!partnerAdditionalProps?.support) {
            return {
                payload: {
                    name: '',
                    phone: '',
                    email: '',
                    url: '',
                    hours: '',
                    channels: [],
                },
            };
        }

        const partnerSupportData = partnerAdditionalProps.support;

        return {
            payload: partnerSupportData,
        };
    }

    /**
     * Translates backend response to UBC (Beckn) format
     */
    public static translateBackendToUBC(
        backendSupportPayload: UBCSupportRequestPayload,
        backendOnSupportResponsePayload: ExtractedOnSupportResponsePayload
    ): UBCOnSupportRequestPayload {
        const context = Utils.getBPPContext({
            ...backendSupportPayload.context,
            action: BecknAction.on_support,
        });
        
        const supportData = backendOnSupportResponsePayload.payload;
        
        // Convert channels to uppercase to match schema (PHONE, EMAIL, WEB, CHAT)
        const channels = supportData.channels?.map(channel => channel.toUpperCase()) || [];
        
        const ubcOnSupportPayload: UBCOnSupportRequestPayload = {
            context: context,
            message: {
                support: {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                    "@type": "beckn:SupportInfo",
                    name: supportData.name,
                    phone: supportData.phone,
                    email: supportData.email,
                    url: supportData.url,
                    hours: supportData.hours,
                    channels: channels,
                },
            },
        };
        return ubcOnSupportPayload;
    }

    /**
     * Sends on_support response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnSupportCallToBecknONIX(payload: UBCOnSupportRequestPayload): Promise<any> {
        const bppHost = Utils.getBPPClientHost();
        return await BppOnixRequestService.sendPostRequest({
            url: `${bppHost}/${BecknAction.on_support}`,
            data: payload,
        }, BecknDomain.EVChargingUBC);
    }

    static async sendErrorOnSupportResponse(originalRequest: UBCSupportRequestPayload, error: Error): Promise<void> {
        // Create new context with action changed to 'on_support' (response action)
        const context = Utils.getBPPContext({
            ...originalRequest.context,
            action: BecknAction.on_support,
        });

        // v0.9: OnSupport response only has support field in message
        // Send back empty support data to allow BAP to resolve the stitched response even on error
        const errorOnSupportPayload: UBCOnSupportRequestPayload = {
            context: context,
            message: {
                support: {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                    "@type": "beckn:SupportInfo",
                    name: '',
                    phone: '',
                    email: '',
                    url: '',
                    hours: '',
                    channels: [],
                },
            },
        };

        logger.debug(`🟡 Sending error on_support response due to processing failure`, { 
            data: { 
                messageId: context.message_id,
                error: error.message 
            } 
        });

        // Send the error response to BPP ONIX, which will forward it to BAP
        await this.sendOnSupportCallToBecknONIX(errorOnSupportPayload);
    }

    static async addSupportInformationToPartner(req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as Support & { partner_id: string };

        try {
            const partner = await OCPIPartnerDbService.getById(payload.partner_id);
            if (!partner) {
                throw new Error('Partner not found');
            }
            const partnerAdditionalProps = partner.additional_props as OCPIPartnerAdditionalProps;
            const updatedAdditionalProps: OCPIPartnerAdditionalProps = {
                ...(partnerAdditionalProps ? partnerAdditionalProps : {}),
                support: {
                    name: payload.name ?? '',
                    phone: payload.phone ?? '',
                    email: payload.email ?? '',
                    url: payload.url ?? '',
                    hours: payload.hours ?? '',
                    channels: payload.channels ?? [],
                },
            };
            await OCPIPartnerDbService.update(partner.id, {
                additional_props: updatedAdditionalProps as unknown as Prisma.InputJsonValue,
            });
            return UBCResponseService.ack();
        } 
        catch (e: any) {
            logger.error(`🔴 Error in addSupportInformationToPartner: ${e?.toString()}`, e);
            return UBCResponseService.nack();
        }
    }
}
