import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import { UBCTrackRequestPayload } from "../../schema/v2.0.0/actions/track/types/TrackPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import OnixBppController from "../../controller/OnixBppController";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import TrackActionService from "../services/TrackActionService";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import { Prisma } from "@prisma/client";
import BecknLogDbService from "../../../db-services/BecknLogDbService";
import PaymentTxnDbService from "../../../db-services/PaymentTxnDbService";
import Utils from "../../../utils/Utils";

/**
 * Handler for track action
 */
export default class TrackActionHandler {
    public static async handleTrack(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCTrackRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.track, req, () => {
            TrackActionHandler.handleEVChargingUBCBppTrackAction(payload)
                .then((ubcOnTrackResponsePayload) => {
                    logger.debug(`🟢 Sending track response in handleTrack`, {
                        data: ubcOnTrackResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(
                        `🔴 Error in handleTrack: 'Something went wrong'`,
                        e,
                    );
                });
        });
    }

    public static async handleEVChargingUBCBppTrackAction(
        reqPayload: UBCTrackRequestPayload,
    ): Promise<void> {
        const reqId = reqPayload.context?.message_id || "unknown";
        const logData = { action: "track", messageId: reqId };

        try {
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppTrackAction`,
                { data: { logData, reqPayload } },
            );
            const backendTrackPayload =
                TrackActionService.translateUBCToBackendPayload(reqPayload);

            logger.debug(
                `🟡 [${reqId}] Building backend track response from sessions in handleEVChargingUBCBppTrackAction`,
                { data: { backendTrackPayload } },
            );
            const backendOnTrackResponsePayload =
                await TrackActionService.buildBackendTrackResponse(backendTrackPayload);

            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppTrackAction`,
                { data: { reqPayload, backendOnTrackResponsePayload } },
            );
            const ubcOnTrackPayload = TrackActionService.translateBackendToUBC(
                reqPayload,
                backendOnTrackResponsePayload,
            );

            logger.debug(
                `🟡 [${reqId}] Sending on_track call to Beckn ONIX in handleEVChargingUBCBppTrackAction`,
                { data: { ubcOnTrackPayload } },
            );
            const response =
                await TrackActionService.sendOnTrackCallToBecknONIX(ubcOnTrackPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_track call to Beckn ONIX in handleEVChargingUBCBppTrackAction`,
                { data: { response } },
            );
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in handleEVChargingUBCBppTrackAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                },
            );
            throw e;
        }
    }

    public static async fetchExistingBppTrackResponse(transactionId: string): Promise<any | null> {
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_track}`,
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
            return becknLogs.records[0].payload;
        }

        return null;
    }

    public static async fetchExistingBppTrackRequest(transactionId: string): Promise<any | null> {
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.in.request.${BecknAction.track}`,
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
            return becknLogs.records[0].payload;
        }

        return null;
    }

    public static async sendOnTrackToBAPONIX(authorization_reference: string): Promise<void> {
        const reqId = authorization_reference;
        
        try {
            // Get payment transaction to get beckn_transaction_id
            const paymentTxn = await PaymentTxnDbService.getByAuthorizationReference(authorization_reference);

            if (!paymentTxn?.beckn_transaction_id) {
                logger.warn(`🟡 [${reqId}] Payment txn or beckn_transaction_id not found for on_track: ${authorization_reference}`);
                return;
            }

            // Fetch existing track REQUEST to use as template (for context, seller, buyer, orderItems structure)
            // We need the original track request, not the response, to get the correct context structure
            const existingBppTrackRequest = await TrackActionHandler.fetchExistingBppTrackRequest(paymentTxn.beckn_transaction_id);
            if (!existingBppTrackRequest) {
                logger.warn(`🟡 [${reqId}] No existing BPP track request found in sendOnTrackToBAPONIX`, { 
                    data: { 
                        authorization_reference,
                        beckn_transaction_id: paymentTxn.beckn_transaction_id
                    } 
                });
                return;
            }

            // Get the order_id from the existing request
            const orderId = existingBppTrackRequest.message?.order?.['beckn:id'] || authorization_reference;

            logger.debug(`🟡 [${reqId}] Building on_track with latest session data`, {
                data: { authorization_reference, orderId, transaction_id: paymentTxn.beckn_transaction_id },
            });

            // Build backend track payload with latest session data
            const backendTrackPayload = {
                metadata: {
                    domain: BecknDomain.EVChargingUBC,
                    beckn_transaction_id: paymentTxn.beckn_transaction_id,
                },
                payload: {
                    order_id: orderId,
                },
            };

            // Fetch latest session data and build backend response
            const backendOnTrackResponsePayload = await TrackActionService.buildBackendTrackResponse(backendTrackPayload);

            // Use existing track REQUEST as the template to preserve structure (seller, buyer, orderItems, context)
            const trackRequestTemplate: UBCTrackRequestPayload = existingBppTrackRequest as UBCTrackRequestPayload;

            // Translate backend response to UBC format using the original request template
            const updatedOnTrackPayload = TrackActionService.translateBackendToUBC(
                trackRequestTemplate,
                backendOnTrackResponsePayload,
            );

            logger.debug(`🟡 [${reqId}] Sending updated on_track to BPP ONIX`, {
                data: { 
                    url: `${Utils.getBPPClientHost()}/${BecknAction.on_track}`,
                    transaction_id: updatedOnTrackPayload.context?.transaction_id,
                    message_id: updatedOnTrackPayload.context?.message_id,
                },
            });

            // Send updated on_track response with latest session data
            await TrackActionService.sendOnTrackCallToBecknONIX(updatedOnTrackPayload);
            logger.debug(`🟢 [${reqId}] Sent updated on_track with latest session data`, {
                data: { authorization_reference, orderId },
            });
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in sendOnTrackToBAPONIX: ${e?.toString()}`,
                e,
                { data: { authorization_reference } },
            );
        }
    }

}
