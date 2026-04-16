import { Prisma } from "@prisma/client";
import { databaseService } from "../../../services/database.service";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import { UBCTrackRequestPayload } from "../../schema/v2.0.0/actions/track/types/TrackPayload";
import { UBCOnTrackRequestPayload } from "../../schema/v2.0.0/actions/track/types/OnTrackPayload";
import {
    UBCAppOnTrackResponsePayload,
    ChargingTelemetry,
    ChargingMetric,
    ChargingMetricsName,
} from "../../schema/v2.0.0/actions/track/types/AppOnTrackPayload";
import Utils from "../../../utils/Utils";
import BppOnixRequestService from "../../services/BppOnixRequestService";
import { OrderStatus } from "../../schema/v2.0.0/enums/OrderStatus";
import { ChargingSessionStatus } from "../../schema/v2.0.0/enums/ChargingSessionStatus";

/**
 * Service encapsulating UBC EV-charging track flow:
 *  - Translate UBC → backend
 *  - Read charging state from OCPI Session
 *  - Translate backend → UBC
 *  - Send on_track callback to Beckn ONIX
 */
export default class TrackActionService {
    // --- Translation UBC -> backend (minimal internal payload) ---
    public static translateUBCToBackendPayload(
        payload: UBCTrackRequestPayload,
    ): { metadata: any; payload: { order_id: string } } {
        return {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                // For now we treat beckn:id as our order/session identifier
                order_id: payload.message.order["beckn:id"],
            },
        };
    }

    // --- Core backend logic: use OCPI Session to build tracking info ---
    public static async buildBackendTrackResponse(
        backendTrackPayload: { payload: { order_id: string } },
    ): Promise<UBCAppOnTrackResponsePayload> {
        const { order_id } = backendTrackPayload.payload;

        // We currently use authorization_reference as the order_id link
        const session = await databaseService.prisma.session.findFirst({
            where: {
                authorization_reference: order_id,
                deleted: false,
            },
        });

        if (!session) {
            // Fallback minimal response – caller may decide how to surface "not found"
            const nowIso = new Date().toISOString();
            return {
                order_id,
                order_status: OrderStatus.CANCELLED,
                charge_point_connector_id: "",
                telemetry_data: {
                    event_time: nowIso,
                    metrics: [],
                },
            };
        }

        const nowIso = new Date().toISOString();

        // Map OCPI session status string → Beckn OrderStatus (very rough mapping)
        const rawStatus = (session.status || "").toUpperCase();
        let orderStatus: OrderStatus = OrderStatus.INPROGRESS;
        let sessionStatus: ChargingSessionStatus = ChargingSessionStatus.ACTIVE;
        if (rawStatus === "COMPLETED" || rawStatus === "FINISHED") {
            orderStatus = OrderStatus.COMPLETED;
            sessionStatus = ChargingSessionStatus.COMPLETED;
        }
        else if (rawStatus === "INVALID" || rawStatus === "CANCELLED") {
            orderStatus = OrderStatus.CANCELLED;
            sessionStatus = ChargingSessionStatus.INTERRUPTED;
        }

        const kwh = session.kwh ? Number(session.kwh as unknown as Prisma.Decimal) : 0;

        const metrics: ChargingMetric[] = [];

        // Always include aggregated ENERGY metric from kWh field
        metrics.push({
            name: ChargingMetricsName.energy,
            value: kwh,
            unit: "KWH",
        });

        // If OCPI charging_periods are present on the Session, try to derive
        // additional telemetry (power, current, voltage, soc) from the last period.
        if (session.charging_periods) {
            try {
                const periods = session.charging_periods as unknown as Array<{
                    start_date_time: string;
                    dimensions: Array<{ type: string; volume: number }>;
                }>;

                if (Array.isArray(periods) && periods.length > 0) {
                    const lastPeriod = periods[periods.length - 1];
                    const dims = Array.isArray(lastPeriod.dimensions)
                        ? lastPeriod.dimensions
                        : [];

                    const pushIfPresent = (
                        dimType: string,
                        name: ChargingMetricsName,
                        unit?: string,
                    ) => {
                        const dim = dims.find(
                            (d) => (d.type || "").toUpperCase() === dimType.toUpperCase(),
                        );
                        if (dim && typeof dim.volume === "number") {
                            metrics.push({
                                name,
                                value: dim.volume,
                                unit,
                            });
                        }
                    };

                    pushIfPresent("POWER", ChargingMetricsName.power, "KW");
                    pushIfPresent("VOLTAGE", ChargingMetricsName.voltage, "V");
                    pushIfPresent("CURRENT", ChargingMetricsName.current, "A");
                    pushIfPresent(
                        "STATE_OF_CHARGE",
                        ChargingMetricsName.soc,
                        "PERCENTAGE",
                    );
                }
            }
            catch {
                // Swallow parsing errors; we still return basic energy metric
            }
        }

        const telemetry: ChargingTelemetry = {
            event_time: nowIso,
            metrics,
        };

        return {
            order_id,
            order_status: orderStatus,
            charge_point_connector_id: "", // Will be set from request in translateBackendToUBC
            telemetry_data: telemetry,
            session_status: sessionStatus,
        };
    }

    // --- Translation backend -> UBC ---
    public static translateBackendToUBC(
        backendTrackPayload: UBCTrackRequestPayload,
        backendOnTrackResponsePayload: UBCAppOnTrackResponsePayload,
    ): UBCOnTrackRequestPayload {
        const context = Utils.getBPPContext({
            ...backendTrackPayload.context,
            action: BecknAction.on_track,
        });

        const trackOrder = backendTrackPayload.message.order;
        
        // Get connector ID from request's orderItems
        const orderedItem = trackOrder["beckn:orderItems"]?.[0]?.["beckn:orderedItem"] || "";

        // v0.9: OnTrack response includes seller, buyer (minimal), orderItems, and fulfillment
        // v0.9: Fulfillment has trackingAction and deliveryAttributes with sessionStatus and chargingTelemetry
        const sessionStatus = backendOnTrackResponsePayload.session_status || 
            (backendOnTrackResponsePayload.order_status === OrderStatus.INPROGRESS 
                ? ChargingSessionStatus.ACTIVE 
                : ChargingSessionStatus.PENDING);

        return {
            context,
            message: {
                order: {
                    "@context":
                        "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                    "@type": trackOrder["@type"],
                    "beckn:id": backendOnTrackResponsePayload.order_id,
                    "beckn:orderStatus": backendOnTrackResponsePayload.order_status,
                    // v0.9: Include seller and buyer from request
                    "beckn:seller": trackOrder["beckn:seller"],
                    "beckn:buyer": trackOrder["beckn:buyer"],
                    "beckn:orderItems": [
                        {
                            "beckn:orderedItem": orderedItem,
                        },
                    ],
                    "beckn:fulfillment": {
                        "@context":
                            "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                        "@type": "beckn:Fulfillment",
                        "beckn:id": "fulfillment-001",
                        "beckn:mode": "RESERVATION",
                        // v0.9: trackingAction at top level
                        trackingAction: {
                            "@type": "beckn:TrackAction",
                            target: {
                                "@type": "schema:EntryPoint",
                                url: backendOnTrackResponsePayload.track_url || "",
                            },
                        },
                        // v0.9: deliveryAttributes with sessionStatus and chargingTelemetry
                        "beckn:deliveryAttributes": {
                            "@context":
                                "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingSession/v1/context.jsonld",
                            "@type": "ChargingSession",
                            sessionStatus: sessionStatus,
                            chargingTelemetry: [
                                {
                                    eventTime:
                                        backendOnTrackResponsePayload.telemetry_data.event_time,
                                    metrics:
                                        backendOnTrackResponsePayload.telemetry_data.metrics.map(m => ({
                                            name: m.name,
                                            value: m.value,
                                            unitCode: m.unit || "",
                                        })),
                                },
                            ],
                        },
                    },
                } as any,
            },
        };
    }

    // --- Send on_track callback to Beckn ONIX ---
    public static async sendOnTrackCallToBecknONIX(
        ubcOnTrackPayload: UBCOnTrackRequestPayload,
    ): Promise<any> {
        // Mirror the behaviour of Select/Init/Confirm handlers:
        // use configured BPP client host instead of raw bap_uri from context,
        // so local/dev DNS works consistently.
        const bppHost = Utils.onix_bpp_caller_url();
        const url = `${bppHost}/${BecknAction.on_track}`;

        return BppOnixRequestService.sendPostRequest(
            {
                url,
                headers: {},
                data: ubcOnTrackPayload,
            },
            BecknDomain.EVChargingUBC,
        );
    }
}

