import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { UBCRatingRequestPayload } from '../../schema/v2.0.0/actions/rating/types/RatingPayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import OnixBppController from '../../controller/OnixBppController';
import { UBCOnRatingRequestPayload } from '../../schema/v2.0.0/actions/rating/types/OnRatingPayload';
import {
    ExtractedRatingRequestBody,
} from '../../schema/v2.0.0/actions/rating/types/ExtractedRatingRequestPayload';
import { ExtractedOnRatingResponsePayload } from '../../schema/v2.0.0/actions/rating/types/ExtractedOnRatingResponsePayload';
import { SubmitRatingRequestPayload } from '../../schema/v2.0.0/actions/rating/types/ExtractedRatingRequestPayload';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import Utils from '../../../utils/Utils';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { SessionDbService } from '../../../db-services/SessionDbService';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps } from '../../../types/OCPIPartner';
import CPOBackendRequestService from '../../services/CPOBackendRequestService';
import { RatingMessage } from '../../schema/v2.0.0/actions/rating/types/OnRatingPayload';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';

/**
 * Handler for rating action
 */
export default class RatingActionHandler {
    public static async handleBppRatingAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCRatingRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.rating, req, () => {
            RatingActionHandler.handleEVChargingUBCBppRatingAction(payload)
                .then((ubcOnRatingResponsePayload: UBCOnRatingRequestPayload) => {
                    logger.debug(`🟢 Sending rating response in handleBppRatingAction`, {
                        data: ubcOnRatingResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppRatingAction: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppRatingAction(
        reqPayload: UBCRatingRequestPayload
    ): Promise<UBCOnRatingRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'rating', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppRatingAction`,
                { data: { logData, reqPayload } }
            );
            const backendRatingPayload: ExtractedRatingRequestBody =
                RatingActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending rating call to backend in handleEVChargingUBCBppRatingAction`,
                { data: { backendRatingPayload } }
            );
            const backendOnRatingResponsePayload: ExtractedOnRatingResponsePayload =
                await RatingActionHandler.sendRatingCallToBackend(backendRatingPayload);
            logger.debug(
                `🟢 [${reqId}] Received rating response from backend in handleEVChargingUBCBppRatingAction`,
                { data: { backendOnRatingResponsePayload } }
            );

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppRatingAction`,
                { data: { reqPayload, backendOnRatingResponsePayload } }
            );
            const ubcOnRatingPayload: UBCOnRatingRequestPayload =
                RatingActionHandler.translateBackendToUBC(reqPayload, backendOnRatingResponsePayload);

            // Call BAP on_rating
            logger.debug(
                `🟡 [${reqId}] Sending on_rating call to Beckn ONIX in handleEVChargingUBCBppRatingAction`,
                { data: { ubcOnRatingPayload } }
            );
            const response = await RatingActionHandler.sendOnRatingCallToBecknONIX(ubcOnRatingPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_rating call to Beckn ONIX in handleEVChargingUBCBppRatingAction`,
                { data: { response } }
            );

            return ubcOnRatingPayload;
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppRatingAction: ${e?.toString()}`,
                e,
                {
                    data: logData,
                }
            );

            throw e;
        }
    }

    public static translateUBCToBackendPayload(
        payload: UBCRatingRequestPayload
    ): ExtractedRatingRequestBody {
        const { id, value, category, feedback } = payload.message;
        
        const backendRatingPayload: ExtractedRatingRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id ?? '',
                bpp_uri: payload.context.bpp_uri ?? '',
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                auth_reference: id, // charge_transaction_id is the authorization_reference
                rating: value,
                rating_category: category,
                comments: feedback?.comments || '',
                tags: feedback?.tags || [],
                location_id: '', // Will be populated from session
            },
        };
        return backendRatingPayload;
    }

    public static async sendRatingCallToBackend(
        payload: ExtractedRatingRequestBody
    ): Promise<ExtractedOnRatingResponsePayload> {
        const { rating, comments, tags } = payload.payload;
        const { beckn_transaction_id } = payload.metadata;

        // Find PaymentTxn by beckn_transaction_id to get authorization_reference
        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                beckn_transaction_id: beckn_transaction_id,
            },
        });

        if (!paymentTxn) {
            throw new Error(`Payment transaction not found for beckn_transaction_id: ${beckn_transaction_id}`);
        }

        if (!paymentTxn.authorization_reference) {
            throw new Error(`Authorization reference not found in payment transaction for beckn_transaction_id: ${beckn_transaction_id}`);
        }

        // Get session using authorization_reference from PaymentTxn
        const session = await SessionDbService.getByAuthorizationReference(paymentTxn.authorization_reference);
        if (!session) {
            throw new Error(`Session not found for authorization_reference: ${paymentTxn.authorization_reference}`);
        }

        if (!session.partner_id) {
            throw new Error(`Partner ID not found in session for authorization_reference: ${paymentTxn.authorization_reference}`);
        }

        // Get OCPI partner to check for mock_rating_request flag
        const ocpiPartner = await OCPIPartnerDbService.getById(session.partner_id);
        if (!ocpiPartner) {
            throw new Error(`OCPI Partner not found for partner_id: ${session.partner_id}`);
        }

        const ocpiPartnerAdditionalProps =
            ocpiPartner.additional_props as OCPIPartnerAdditionalProps;

        // Check if mock_rating_request is enabled
        if (ocpiPartnerAdditionalProps?.mock_rating_request === true) {
            logger.debug(`🟡 Mocking rating response for beckn_transaction_id: ${beckn_transaction_id}`);
            
            // Return mocked response with session id for feedbackForm
            const backendOnRatingResponsePayload: ExtractedOnRatingResponsePayload = {
                metadata: {
                    domain: BecknDomain.EVChargingUBC,
                },
                payload: {
                    success: true,
                    session_id: session.id, // Pass session id for feedbackForm
                },
            };

            return backendOnRatingResponsePayload;
        }

        // Continue with actual backend call
        if (!session.location_id ) {
            throw new Error(`Location ID not found in session for authorization_reference: ${paymentTxn.authorization_reference}`);
        }

        const submitRating =
            ocpiPartnerAdditionalProps?.communication_urls?.submit_rating;
        
        if (!submitRating) {
            throw new Error('Submit rating endpoint not found in partner configuration');
        }

        const submitRatingUrl = submitRating.url;
        const submitRatingAuthToken = submitRating.auth_token;

        // Prepare request payload for CPO
        const submitRatingPayload: SubmitRatingRequestPayload = {
            location_id: session.location_id,
            rating: rating,
            auth_reference: paymentTxn.authorization_reference,
        };
        
        // Add optional fields if they exist
        if (comments) {
            submitRatingPayload.comments = comments;
        }
        if (tags && tags.length > 0) {
            submitRatingPayload.tags = tags;
        }

        // Prepare headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (submitRatingAuthToken) {
            headers['Authorization'] = `${submitRatingAuthToken}`;
        }

        // Call CPO's submit rating API
        // CPOBackendRequestService returns response.data directly
        const responseData = await CPOBackendRequestService.sendPostRequest({
            url: submitRatingUrl,
            data: submitRatingPayload,
            headers: headers,
        });
        
        const backendOnRatingResponsePayload: ExtractedOnRatingResponsePayload = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
            },
            payload: {
                success: responseData.success ?? true,
                message: responseData.message,
                feedbackForm: responseData.feedbackForm,
                session_id: session.id, // Pass session id for feedbackForm
            },
        };

        return backendOnRatingResponsePayload;
    }

    public static translateBackendToUBC(
        backendRatingPayload: UBCRatingRequestPayload,
        backendOnRatingResponsePayload: ExtractedOnRatingResponsePayload
    ): UBCOnRatingRequestPayload {
        const context = Utils.getBPPContext({
            ...backendRatingPayload.context,
            action: BecknAction.on_rating,
        });

        const message: RatingMessage = {
            received: backendOnRatingResponsePayload.payload.success,
        };

        // Always include feedbackForm with hardcoded values and session id as submission_id
        const sessionId = backendOnRatingResponsePayload.payload.session_id || '';
        message.feedbackForm = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
            "@type": "beckn:Form",
            "mime_type": "application/xml",
            "submission_id": sessionId,
            "url": "https://example-bpp.com/feedback/portal",
        };

        const ubcOnRatingPayload: UBCOnRatingRequestPayload = {
            context: context,
            message: message,
        };
        return ubcOnRatingPayload;
    }

    /**
     * Sends on_rating response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnRatingCallToBecknONIX(payload: UBCOnRatingRequestPayload): Promise<any> {
        const bppHost = Utils.onix_bpp_caller_url();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_rating}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }
}
