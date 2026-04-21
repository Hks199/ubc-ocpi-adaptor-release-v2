/**
 * Request payload for publish action from CPO/App
 * Based on Catalog Publish API requirements
 * Exactly ONE of the following must be provided: ocpi_location_ids, evse_ids, connector_ids, or partner_id
 * BPP ID, BPP URI, and transaction ID are automatically generated from config
 */
export type PostAppPublishRequestPayload = {
    /** Array of OCPI Location IDs - mutually exclusive with evse_ids, connector_ids, partner_id */
    ocpi_location_ids?: string[];
    /** Array of EVSE IDs (uid) - mutually exclusive with ocpi_location_ids, connector_ids, partner_id */
    evse_ids?: string[];
    /**
     * Per-connector publish filter. Each value may match `evse_connector.id` (UUID),
     * `beckn_connector_id` (e.g. IND*…), or OCPI `connector_id` for that EVSE (may match multiple EVSEs).
     * Mutually exclusive with ocpi_location_ids, evse_ids, partner_id.
     */
    connector_ids?: string[];
    /** Partner ID - fetch all locations for this partner - mutually exclusive with ocpi_location_ids, evse_ids, connector_ids */
    partner_id?: string;
    /** Optional: Accepted payment methods (defaults to [UPI, BANK_TRANSFER] if not provided) */
    accepted_payment_methods?: string[];
    /** Optional: Catalog validity period (defaults to tariff validity dates if not provided) */
    validity?: {
        /** Required: Start date (ISO 8601 date format) */
        start_date: string;
        /** Required: End date (ISO 8601 date format) */
        end_date: string;
    };
    /** Optional: Availability windows for items (defaults to 30 days from today if not provided) */
    availability_windows?: Array<{
        /** Start time in ISO 8601 format with offset (e.g., "2026-01-04T06:00:00+05:30") */
        start_time: string;
        /** End time in ISO 8601 format with offset (e.g., "2026-01-04T22:00:00+05:30") */
        end_time: string;
    }>;
    /** Optional: Whether items are active (defaults to true) */
    isActive?: boolean;
    /** Optional: Reservation time in seconds. If provided, excludes the period from now to now + reservationTime from availability windows */
    reservationTime?: number;
    /**
     * When set with `partner_id` (full-network publish), only this EVSEConnector row (`id`) gets
     * `reservationTime` on availability windows and `beckn:isActive: false` while reserved. All other
     * connectors stay fully available and active.
     */
    engaged_internal_connector_id?: string;
};

