import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import {
    RatingFeedback,
    UBCRatingRequestMessage,
    UBCRatingRequestPayload,
} from '../../schema/v2.0.0/actions/rating/types/RatingPayload';
import { RatingCategory } from '../../schema/v2.0.0/types/RatingCategory';
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
import RatingRecordDbService from '../../../db-services/RatingRecordDbService';

/**
 * Handler for rating action
 */
export default class RatingActionHandler {
    private static readonly DEFAULT_BEST = 5;
    private static readonly DEFAULT_WORST = 1;
    private static readonly DEFAULT_RATING_WHEN_MISSING = 3;
    private static readonly DEFAULT_CATEGORY = RatingCategory.Order;

    /**
     * Expands Beckn `message.ratings[]` into one payload per rating (distinct `message_id` suffix),
     * or a single legacy flat `message`. Each result is safe for Prisma / CPO / mock.
     */
    private static expandRatingJobs(payload: UBCRatingRequestPayload): UBCRatingRequestPayload[] {
        const rawMsg = payload?.message as unknown;
        if (rawMsg === null || rawMsg === undefined || typeof rawMsg !== 'object') {
            logger.warn('🟡 Rating: message missing or invalid; using defaults', {
                data: { transaction_id: payload?.context?.transaction_id },
            });
            return [
                {
                    ...payload,
                    message: RatingActionHandler.buildDefaultRatingMessage(),
                },
            ];
        }

        const msg = rawMsg as Record<string, unknown>;
        const ratings = msg['ratings'] ?? msg['beckn:ratings'];
        if (Array.isArray(ratings) && ratings.length > 0) {
            return ratings.map((entry, i) => {
                const row =
                    entry && typeof entry === 'object' && !Array.isArray(entry)
                        ? { ...(entry as Record<string, unknown>) }
                        : {};
                const merged = RatingActionHandler.mergeRatingMessageLayers(row);
                const message = RatingActionHandler.normalizeCoercedMessageFromLayer(merged, payload.context.transaction_id, true);
                const baseMsgId = payload.context.message_id;
                return {
                    ...payload,
                    context: {
                        ...payload.context,
                        message_id: i === 0 ? baseMsgId : `${baseMsgId}#${i}`,
                    },
                    message,
                };
            });
        }

        const merged = RatingActionHandler.mergeRatingMessageLayers(msg);
        const message = RatingActionHandler.normalizeCoercedMessageFromLayer(
            merged,
            payload.context.transaction_id,
            false,
        );
        return [{ ...payload, message }];
    }

    /**
     * Maps one merged rating row (flat legacy or one `RatingInput` object) to a normalized message.
     */
    private static normalizeCoercedMessageFromLayer(
        merged: Record<string, unknown>,
        transactionId: string | undefined,
        fromRatingsArray: boolean,
    ): UBCRatingRequestMessage {
        const valueRaw = RatingActionHandler.pickFirstFiniteNumber(merged, [
            'value',
            'ratingValue',
            'beckn:ratingValue',
            'score',
            'stars',
            'overallRating',
        ]);
        const bestRaw = RatingActionHandler.pickFirstFiniteNumber(merged, [
            'best',
            'bestRating',
            'beckn:bestRating',
            'maxRating',
        ]);
        const worstRaw = RatingActionHandler.pickFirstFiniteNumber(merged, [
            'worst',
            'worstRating',
            'beckn:worstRating',
            'minRating',
        ]);
        const best = bestRaw ?? RatingActionHandler.DEFAULT_BEST;
        const worst = worstRaw ?? RatingActionHandler.DEFAULT_WORST;
        let value = valueRaw ?? RatingActionHandler.DEFAULT_RATING_WHEN_MISSING;
        if (value < worst) {
            value = worst;
        }
        if (value > best) {
            value = best;
        }

        const categoryStr = RatingActionHandler.pickFirstString(merged, [
            'category',
            'beckn:ratingCategory',
            'ratingCategory',
            'type',
        ]);
        const category = RatingActionHandler.coerceRatingCategory(categoryStr);

        const id =
            RatingActionHandler.pickFirstString(merged, [
                'id',
                'beckn:id',
                'entityId',
                'refId',
                'orderId',
            ]) ?? '';

        const feedback = RatingActionHandler.normalizeRatingFeedback(merged['feedback'] ?? merged['beckn:feedback']);

        const hadValue = valueRaw !== undefined && valueRaw !== null;
        if (!hadValue || !categoryStr) {
            logger.warn('🟡 Rating: coerced missing fields from BAP payload', {
                data: {
                    transaction_id: transactionId,
                    fromRatingsArray,
                    hadNumericValue: hadValue,
                    hadCategory: !!categoryStr,
                    usedDefaults: { value, category, best, worst },
                },
            });
        }

        return {
            id,
            value,
            best,
            worst,
            category,
            ...(feedback ? { feedback } : {}),
        };
    }

    private static buildDefaultRatingMessage(): UBCRatingRequestMessage {
        return {
            id: '',
            value: RatingActionHandler.DEFAULT_RATING_WHEN_MISSING,
            best: RatingActionHandler.DEFAULT_BEST,
            worst: RatingActionHandler.DEFAULT_WORST,
            category: RatingActionHandler.DEFAULT_CATEGORY,
        };
    }

    private static mergeRatingMessageLayers(msg: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = { ...msg };
        const nested = msg['rating'] ?? msg['beckn:Rating'];
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
                if (out[k] === undefined || out[k] === null || out[k] === '') {
                    out[k] = v;
                }
            }
        }
        return out;
    }

    private static pickFirstFiniteNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
        for (const key of keys) {
            const v = obj[key];
            if (typeof v === 'number' && Number.isFinite(v)) {
                return v;
            }
            if (typeof v === 'string' && v.trim() !== '') {
                const n = Number(v);
                if (Number.isFinite(n)) {
                    return n;
                }
            }
        }
        return undefined;
    }

    private static pickFirstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const key of keys) {
            const v = obj[key];
            if (typeof v === 'string' && v.trim() !== '') {
                return v.trim();
            }
        }
        return undefined;
    }

    private static coerceRatingCategory(raw: string | undefined): RatingCategory {
        if (!raw) {
            return RatingActionHandler.DEFAULT_CATEGORY;
        }
        const trimmed = raw.trim();
        const upper = trimmed.toUpperCase();
        const upperMap: Record<string, RatingCategory> = {
            ITEM: RatingCategory.Item,
            ORDER: RatingCategory.Order,
            FULFILLMENT: RatingCategory.Fulfillment,
            PROVIDER: RatingCategory.Provider,
            AGENT: RatingCategory.Agent,
            SUPPORT: RatingCategory.Support,
        };
        if (upperMap[upper]) {
            return upperMap[upper];
        }
        const allowed = Object.values(RatingCategory) as string[];
        if (allowed.includes(trimmed)) {
            return trimmed as RatingCategory;
        }
        return RatingActionHandler.DEFAULT_CATEGORY;
    }

    private static normalizeRatingFeedback(raw: unknown): RatingFeedback | undefined {
        if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
            return undefined;
        }
        const o = raw as Record<string, unknown>;
        const commentsRaw = o.comments ?? o['beckn:comments'] ?? o['beckn:description'];
        const tagsRaw = o.tags ?? o['beckn:tags'];
        const comments = typeof commentsRaw === 'string' ? commentsRaw : undefined;
        let tags: string[] | undefined;
        if (Array.isArray(tagsRaw)) {
            tags = tagsRaw.filter((t): t is string => typeof t === 'string');
        }
        if (!comments && (!tags || tags.length === 0)) {
            return undefined;
        }
        return { ...(comments ? { comments } : {}), ...(tags && tags.length > 0 ? { tags } : {}) };
    }

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
        let ratingRecordId: string | null = null;
        let lastOnRatingPayload: UBCOnRatingRequestPayload | undefined;

        const jobs = RatingActionHandler.expandRatingJobs(reqPayload);
        logger.debug(`🟡 [${reqId}] Rating jobs expanded count=${jobs.length}`, {
            data: { transaction_id: reqPayload.context?.transaction_id },
        });

        try {
            for (let i = 0; i < jobs.length; i++) {
                const normalizedPayload = jobs[i];
                const jobReqId = normalizedPayload.context?.message_id || reqId;
                ratingRecordId = null;

                logger.debug(
                    `🟡 [${jobReqId}] Translating UBC to Backend payload (rating job ${i + 1}/${jobs.length})`,
                    { data: { logData, reqPayload: normalizedPayload } },
                );
                const backendRatingPayload: ExtractedRatingRequestBody =
                    RatingActionHandler.translateUBCToBackendPayload(normalizedPayload);
                const ratingRecord = await RatingActionHandler.createRatingRecord(
                    normalizedPayload,
                    backendRatingPayload,
                );
                ratingRecordId = ratingRecord.id;

                logger.debug(
                    `🟡 [${jobReqId}] Sending rating call to backend (rating job ${i + 1}/${jobs.length})`,
                    { data: { backendRatingPayload } },
                );
                const backendOnRatingResponsePayload: ExtractedOnRatingResponsePayload =
                    await RatingActionHandler.sendRatingCallToBackend(backendRatingPayload, ratingRecordId);
                logger.debug(
                    `🟢 [${jobReqId}] Received rating response from backend`,
                    { data: { backendOnRatingResponsePayload } },
                );

                logger.debug(
                    `🟡 [${jobReqId}] Translating Backend to UBC payload`,
                    { data: { backendOnRatingResponsePayload } },
                );
                const ubcOnRatingPayload: UBCOnRatingRequestPayload =
                    RatingActionHandler.translateBackendToUBC(normalizedPayload, backendOnRatingResponsePayload);

                logger.debug(
                    `🟡 [${jobReqId}] Sending on_rating call to Beckn ONIX`,
                    { data: { ubcOnRatingPayload } },
                );
                const response = await RatingActionHandler.sendOnRatingCallToBecknONIX(ubcOnRatingPayload);
                await RatingRecordDbService.update(ratingRecordId, {
                    on_rating_payload: ubcOnRatingPayload as any,
                    status: 'ON_RATING_SENT',
                    additional_props: {
                        on_rating_ack: response,
                    } as any,
                });
                logger.debug(`🟢 [${jobReqId}] Sent on_rating (job ${i + 1}/${jobs.length})`, { data: { response } });

                lastOnRatingPayload = ubcOnRatingPayload;
                ratingRecordId = null;
            }

            if (!lastOnRatingPayload) {
                throw new Error('Rating: no jobs processed');
            }
            return lastOnRatingPayload;
        }
        catch (e: any) {
            if (ratingRecordId) {
                await RatingRecordDbService.update(ratingRecordId, {
                    status: 'FAILED',
                    error_message: e?.message || e?.toString?.() || 'Unknown error',
                });
            }
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
        const m = payload.message;
        const id = m.id ?? '';
        const value = Number(m.value);
        const category = (m.category ?? RatingActionHandler.DEFAULT_CATEGORY) as RatingCategory;
        const feedback = m.feedback;

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
                rating: Number.isFinite(value) ? value : RatingActionHandler.DEFAULT_RATING_WHEN_MISSING,
                rating_category: category,
                comments: feedback?.comments || '',
                tags: feedback?.tags || [],
                location_id: '', // Will be populated from session
            },
        };
        return backendRatingPayload;
    }

    public static async createRatingRecord(
        payload: UBCRatingRequestPayload,
        backendPayload: ExtractedRatingRequestBody
    ) {
        return RatingRecordDbService.create({
            data: {
                beckn_transaction_id: payload.context.transaction_id,
                message_id: payload.context.message_id,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
                rating_value: Number(payload.message.value),
                rating_category: String(payload.message.category ?? RatingActionHandler.DEFAULT_CATEGORY),
                best_rating: payload.message.best,
                worst_rating: payload.message.worst,
                auth_reference: backendPayload.payload.auth_reference,
                comments: backendPayload.payload.comments,
                tags: backendPayload.payload.tags as any,
                backend_request: backendPayload as any,
                status: 'RECEIVED',
            },
        });
    }

    public static async sendRatingCallToBackend(
        payload: ExtractedRatingRequestBody,
        ratingRecordId?: string | null
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

        if (ratingRecordId) {
            await RatingRecordDbService.update(ratingRecordId, {
                payment_txn_id: paymentTxn.id,
                session_id: session.id,
                partner_id: session.partner_id,
                auth_reference: paymentTxn.authorization_reference,
                status: 'RESOLVED',
            });
        }

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

            if (ratingRecordId) {
                await RatingRecordDbService.update(ratingRecordId, {
                    backend_response: backendOnRatingResponsePayload as any,
                    status: 'MOCKED',
                    additional_props: {
                        mock_rating_request: true,
                    } as any,
                });
            }

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

        if (ratingRecordId) {
            await RatingRecordDbService.update(ratingRecordId, {
                backend_url: submitRatingUrl,
                backend_request: submitRatingPayload as any,
                backend_response: backendOnRatingResponsePayload as any,
                status: 'FORWARDED',
            });
        }

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
