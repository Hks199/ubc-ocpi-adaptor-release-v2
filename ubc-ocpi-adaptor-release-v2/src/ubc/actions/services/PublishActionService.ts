import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { UBCVersion } from '../../schema/v2.0.0/enums/UBCVersion';
import { UBCPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PublishPayload';
import { UBCPublishResponsePayload } from '../../schema/v2.0.0/actions/publish/types/PublishResponsePayload';
import { PostAppPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PostAppPublishRequestPayload';
import Utils from '../../../utils/Utils';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { logger } from '../../../services/logger.service';
import { BecknCatalog } from '../../schema/v2.0.0/types/Catalog';
import { BecknItem } from '../../schema/v2.0.0/types/Item';
import { BecknCatalogOffer } from '../../schema/v2.0.0/types/CatalogOffer';
import { BecknChargingServiceAttributes } from '../../schema/v2.0.0/types/ChargingService';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import { AcceptedPaymentMethod } from '../../schema/v2.0.0/enums/AcceptedPaymentMethod';
import { LocationWithRelations } from '../../../db-services/LocationDbService';
import { TariffDbService, TariffWithRelations } from '../../../db-services/TariffDbService';
import { EVSEConnector, Location, EVSE, OCPIPartner, Prisma } from '@prisma/client';
import { databaseService } from '../../../services/database.service';
import GLOBAL_VARS from '../../../constants/global-vars';
import { ValidationError } from '../../../utils/errors';
import { OCPIHours, OCPIRegularHours } from '../../../ocpi/schema/modules/locations/types';
import { EvseConnectorDbService } from '../../../db-services/EvseConnectorDbService';
import { AppPublishResponsePayload } from '../../schema/v2.0.0/actions/publish/types/AppPublishResponsePayload';
import { ISODateTime } from '../../../ocpi/schema/general/types';
import { ParkingType } from '../../schema/v2.0.0/enums/ParkingType';

/**
 * Map entry type for locations with EVSEs and connectors
 * Used to build catalogs with specific filtering by connector_ids, evse_ids, etc.
 */
export type LocationMapEntry = Location & {
    evses: Map<string, EVSE & {
        connectors: EVSEConnector[];
    }>;
    partner: OCPIPartner | null;
};

export type UBCPublishInfo = {
    last_successfully_published_at?: ISODateTime; // The timestamp when the connector was last successfully published
    currently_is_active?: boolean; // Current status of the connector, if it is active or not
    last_published_item_info: {
        is_active?: boolean; // Sent by BPP to indicate if the connector is active or not
        updated_on?: ISODateTime; // The timestamp when the connector was last updated
        status?: 'ACCEPTED' | 'REJECTED'; // The status of the last publish
        item_count?: number; // The number of items published
        warnings?: {
            code: string,
            message: string
        }[];
        error?: {
            code: string,
            message: string
            paths: string[]
        };
    }
};

/**
 * Formats a Date object to ISO 8601 string with timezone offset
 * Format: yyyy-mm-ddTHH:MM:SS±hh:mm
 */
/**
 * Formats a Date to ISO 8601 datetime string in UTC (ending with Z)
 * @param date - Date object to format
 * @returns ISO 8601 datetime string in UTC (e.g., "2026-01-04T08:00:00Z")
 */
function formatISOUTC(date: Date): string {
    // Convert to UTC and format as ISO string ending with Z
    return date.toISOString();
}

/**
 * Converts a timestamp string to ISO 8601 UTC format (ending with Z)
 * Handles timestamps with timezone offsets (e.g., "+05:30") and converts them to UTC
 * @param timestamp - Timestamp string in any ISO 8601 format
 * @returns ISO 8601 datetime string in UTC (e.g., "2026-01-04T08:00:00Z")
 */
function convertToUTC(timestamp: string): string {
    // If already in UTC format (ends with Z), return as-is
    if (timestamp.endsWith('Z')) {
        return timestamp;
    }
    
    // Parse the timestamp and convert to UTC
    const date = new Date(timestamp);
    
    // Check if parsing was successful
    if (isNaN(date.getTime())) {
        // If parsing fails, return original (shouldn't happen with valid ISO strings)
        return timestamp;
    }
    
    // Return in UTC format
    return date.toISOString();
}

/**
 * Gets start of today in UTC
 */
function getStartOfTodayWithOffset(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return formatISOUTC(d);
}

/**
 * Gets end of day N days from now in UTC
 */
function getEndOfDayNDaysFromNowWithOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 59, 0);
    return formatISOUTC(d);
}

/**
 * Calculates availability windows for the next 7 days based on opening hours
 * Handles gaps in availability by creating separate time periods
 * @param openingHours - OCPI opening hours
 * @param reservationTime - Optional reservation time in seconds. If provided, excludes the period from now to now + reservationTime from availability
 */
function calculateAvailabilityWindowsFromOpeningHours(
    openingHours: OCPIHours | null,
    reservationTime?: number
): Array<{ start_time: string; end_time: string }> {
    const windows: Array<{ start_time: string; end_time: string }> = [];
    const now = new Date();
    const reservationEnd = reservationTime ? new Date(now.getTime() + reservationTime * 1000) : null;
    
    if (!openingHours) {
        // No opening hours - default to 7 days continuous
        const startTime = getStartOfTodayWithOffset();
        const endTime = getEndOfDayNDaysFromNowWithOffset(6); // 7 days = today + 6 more days
        const defaultWindow = { start_time: startTime, end_time: endTime };
        
        // Apply reservation time if provided
        if (reservationEnd) {
            return applyReservationToWindows([defaultWindow], now, reservationEnd);
        }
        return [defaultWindow];
    }

    // Handle 24/7 case
    if (openingHours.twentyfourseven) {
        const startTime = getStartOfTodayWithOffset();
        const endTime = getEndOfDayNDaysFromNowWithOffset(6);
        const defaultWindow = { start_time: startTime, end_time: endTime };
        
        // Apply reservation time if provided
        if (reservationEnd) {
            return applyReservationToWindows([defaultWindow], now, reservationEnd);
        }
        return [{ start_time: startTime, end_time: endTime }];
    }

    // Handle regular hours
    if (openingHours.regular_hours && openingHours.regular_hours.length > 0) {
        const today = new Date();

        // Process each day for the next 7 days
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + dayOffset);
            currentDate.setHours(0, 0, 0, 0);
            
            const weekday = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            // Convert to OCPI weekday format: 1 = Monday, 2 = Tuesday, ..., 7 = Sunday
            const ocpiWeekday = weekday === 0 ? 7 : weekday;
            
            // Find regular hours for this weekday
            const dayHours = openingHours.regular_hours.filter((rh: OCPIRegularHours) => {
                const rhWeekday = typeof rh.weekday === 'bigint' ? Number(rh.weekday) : rh.weekday;
                return rhWeekday === ocpiWeekday;
            });

            if (dayHours.length === 0) {
                // No hours for this day - skip (closed)
                continue;
            }

            // Sort periods by begin time
            const sortedHours = dayHours.sort((a, b) => {
                const timeA = a.period_begin || "00:00";
                const timeB = b.period_begin || "00:00";
                return timeA.localeCompare(timeB);
            });

            // Create windows for each period
            for (const hour of sortedHours) {
                const beginTime = hour.period_begin || "00:00";
                const endTime = hour.period_end || "23:59";
                
                // Parse time (HH:MM format)
                const [beginH, beginM] = beginTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                
                const startDateTime = new Date(currentDate);
                startDateTime.setHours(beginH, beginM || 0, 0, 0);
                
                const endDateTime = new Date(currentDate);
                endDateTime.setHours(endH, endM || 0, 59, 999);
                
                // If end time is before start time, it means it spans to next day
                if (endDateTime < startDateTime) {
                    endDateTime.setDate(endDateTime.getDate() + 1);
                }
                
                windows.push({
                    start_time: formatISOUTC(startDateTime),
                    end_time: formatISOUTC(endDateTime),
                });
            }
        }
    }

    // If no windows were created, default to 7 days continuous
    if (windows.length === 0) {
        const startTime = getStartOfTodayWithOffset();
        const endTime = getEndOfDayNDaysFromNowWithOffset(6);
        const defaultWindow = { start_time: startTime, end_time: endTime };
        
        // Apply reservation time if provided
        if (reservationEnd) {
            return applyReservationToWindows([defaultWindow], now, reservationEnd);
        }
        return [defaultWindow];
    }

    // Apply reservation time if provided
    if (reservationEnd) {
        return applyReservationToWindows(windows, now, reservationEnd);
    }

    return windows;
}

/**
 * Applies reservation period exclusion to availability windows
 * Splits windows that overlap with the reservation period [now, reservationEnd]
 */
function applyReservationToWindows(
    windows: Array<{ start_time: string; end_time: string }>,
    now: Date,
    reservationEnd: Date
): Array<{ start_time: string; end_time: string }> {
    const result: Array<{ start_time: string; end_time: string }> = [];

    for (const window of windows) {
        const windowStart = new Date(window.start_time);
        const windowEnd = new Date(window.end_time);

        // Window is completely before now - keep as-is
        if (windowEnd <= now) {
            result.push(window);
            continue;
        }

        // Window is completely after reservation end - keep as-is
        if (windowStart >= reservationEnd) {
            result.push(window);
            continue;
        }

        // Window overlaps with reservation period - split it
        // Add [start, now] if start < now
        if (windowStart < now) {
            result.push({
                start_time: window.start_time,
                end_time: formatISOUTC(now),
            });
        }

        // Add [reservationEnd, end] if end > reservationEnd
        if (windowEnd > reservationEnd) {
            result.push({
                start_time: formatISOUTC(reservationEnd),
                end_time: window.end_time,
            });
        }

        // If window is completely inside reservation period, skip it (no availability)
    }

    return result;
}

/**
 * ConnectorType enum values (normal standards, not OCPI terms)
 */
enum ConnectorType {
    CCS2 = 'CCS2',
    CHAdeMO = 'CHAdeMO',
    GBT = 'GB_T',
    Type2 = 'Type2',
    Type1 = 'Type1',
    IEC60309 = 'IEC60309',
    WallSocket15A = 'WallSocket15A',
    AC001 = 'AC-001',
    DC001 = 'DC-001',
}

/**
 * Maps OCPI connector standards to normal ConnectorType values
 * This is used when publishing to convert OCPI terms to standard connector types
 */
const typeMap: Record<string, ConnectorType> = {
    // ===== DC fast charging =====
    IEC_62196_T2_COMBO: ConnectorType.CCS2,     // CCS2
    IEC_62196_T1_COMBO: ConnectorType.CCS2,     // CCS1 → closest match
    CHADEMO: ConnectorType.CHAdeMO,
    GBT_DC: ConnectorType.GBT,                  // ❌ non-OCPI, normalize
    GB_T_DC: ConnectorType.GBT,                 // ✅ OCPI

    // ===== AC charging =====
    IEC_62196_T2: ConnectorType.Type2,
    IEC_62196_T1: ConnectorType.Type1,
    GB_T_AC: ConnectorType.GBT,
    IEC_60309: ConnectorType.IEC60309,
    IEC_60309_2_three_32: ConnectorType.IEC60309, // non-OCPI variant

    // ===== Household / wall sockets =====
    DOMESTIC_I: ConnectorType.WallSocket15A,
    DOMESTIC_G: ConnectorType.WallSocket15A,
    DOMESTIC_F: ConnectorType.WallSocket15A,

    // ===== Legacy / internal =====
    AC_001: ConnectorType.AC001,
    DC_001: ConnectorType.DC001,
};

/**
 * Converts OCPI connector standard to normal ConnectorType
 * @param ocpiStandard - OCPI connector standard (e.g., "IEC_62196_T2_COMBO")
 * @returns Normal connector type (e.g., "CCS2") or the original value if not found in map
 */
export function convertOcpiStandardToConnectorType(ocpiStandard: string | null | undefined): string {
    if (!ocpiStandard) {
        return 'UNKNOWN';
    }
    
    // Try exact match first
    const normalized = ocpiStandard.toUpperCase();
    if (typeMap[normalized]) {
        return typeMap[normalized];
    }
    
    // Try with underscores normalized
    const withUnderscores = normalized.replace(/-/g, '_');
    if (typeMap[withUnderscores]) {
        return typeMap[withUnderscores];
    }
    
    // Return original if no mapping found
    return ocpiStandard;
}

/**
 * Service for handling publish action
 */
export default class PublishActionService {
    /**
     * Formats a validity date to ISO 8601 datetime string with timezone
     * Accepts date in any format (string or Date object) and converts to ISO 8601
     * @param date - Date string or Date object (can be in any format)
     * @param isStartDate - If true, uses 00:00:00Z, if false uses 23:59:59Z
     * @returns ISO 8601 datetime string with timezone (e.g., "2026-03-31T23:59:59Z")
     */
    private static formatValidityDate(date: string | Date | null | undefined, isStartDate: boolean): string {
        // Default date: current date for start, 1 year from now for end
        const defaultDate = isStartDate 
            ? new Date() 
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        
        // If date is null/undefined, return default
        if (!date) {
            return this.formatDateToISO(defaultDate, isStartDate);
        }
        
        // If already a Date object, format it
        if (date instanceof Date) {
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return this.formatDateToISO(defaultDate, isStartDate);
            }
            return this.formatDateToISO(date, isStartDate);
        }
        
        // If it's a string, try to parse it
        if (typeof date === 'string') {
            // If already in ISO datetime format with timezone, return as-is
            if (date.includes('T') && (date.includes('Z') || date.includes('+') || date.includes('-'))) {
                // Validate it's a valid ISO datetime
                const parsed = new Date(date);
                if (!isNaN(parsed.getTime())) {
                    return date;
                }
            }
            
            // Try to parse the date string
            const parsedDate = new Date(date);
            
            // Check if parsing was successful
            if (!isNaN(parsedDate.getTime())) {
                return this.formatDateToISO(parsedDate, isStartDate);
            }
        }
        
        // If all parsing attempts fail, return default
        return this.formatDateToISO(defaultDate, isStartDate);
    }

    /**
     * Formats a Date object to ISO 8601 datetime string with timezone
     * @param date - Date object
     * @param isStartDate - If true, uses 00:00:00Z, if false uses 23:59:59Z
     * @returns ISO 8601 datetime string with timezone (e.g., "2026-03-31T23:59:59Z")
     */
    private static formatDateToISO(date: Date, isStartDate: boolean): string {
        // Create a new date to avoid mutating the original
        const formattedDate = new Date(date);
        
        if (isStartDate) {
            // Set to start of day in UTC
            formattedDate.setUTCHours(0, 0, 0, 0);
        }
        else {
            // Set to end of day in UTC
            formattedDate.setUTCHours(23, 59, 59, 999);
        }
        
        // Return ISO string (always ends with Z for UTC)
        return formattedDate.toISOString();
    }

    /**
     * Calculates reservation time for start charging based on estimated cost, power rating, and tariff rate
     * Similar to calculateReservationTime but for start charging scenario
     */
    public static calculateReservationTimeForStartCharging(params: {
        estimatedCost: number,
        powerRating: number,
        tariffRate: number,
        efficiency?: number,
        buffer?: number, // in seconds // 5 minute buffer is added by default
    }): number {
        const { estimatedCost, powerRating, tariffRate, efficiency = 0.9, buffer = 5 * 60 } = params;
        const denominator = powerRating * tariffRate * efficiency;
        if (denominator > 0) {
            const reservationTimeHours = (estimatedCost / denominator);
            return reservationTimeHours * 3600 + buffer;
        }
        return buffer;
    }

    /**
     * Publishes catalog with reservation time for a specific connector
     * Used to mark charger as unavailable during charging sessions
     * @param ocpiLocationId - OCPI location ID
     * @param reservationTime - Optional reservation time in seconds
     * @param becknConnectorId - Optional Beckn connector ID (format: IND*{ubc_party_id}*{ocpi_location_id}*{evse_uid}*{connector_id}). If provided, only this connector will be published.
     */
    /**
     * Publishes catalog with reservation time for a specific connector
     * Used to mark charger as unavailable during charging sessions
     * @param connectorId - OCPI connector ID (e.g., "1", "2")
     * @param reservationTime - Optional reservation time in seconds
     */
    public static async publishWithReservation(
        connectorId: string,
        reservationTime?: number
    ): Promise<void> {
        try {
            if (GLOBAL_VARS.ENABLE_CATALOG_PUBLISH === 'false') {
                logger.debug(`🟢 Skipping catalog publish for connector ${connectorId}`, {
                    reservationTime: reservationTime,
                });
                return;
            }

            const publishPayload: PostAppPublishRequestPayload = {
                connector_ids: [connectorId],
                reservationTime: reservationTime,
            };

            const { payload: ubcPublishPayload } = await this.translateAppPayloadToUBC(publishPayload);
            await this.sendPublishCallToBecknONIX(ubcPublishPayload);

            logger.debug(`🟢 Published catalog with reservation for connector ${connectorId}`, {
                reservationTime: reservationTime,
            });
        }
        catch (e: any) {
            logger.error(`🔴 Error publishing with reservation for connector ${connectorId}: ${e?.toString()}`, e);
            // Don't throw - publish failures shouldn't block charging operations
        }
    }
    /**
     * Gets appropriate charging description based on connector type and power
     */
    private static getPhysicalReference(evse: EVSE): string {
        let physicalReference = evse.physical_reference || '';

        if (!physicalReference && evse.evse_id) {
            physicalReference = Utils.convertNumericSuffixToLetter(evse.evse_id);
        }

        return physicalReference;
    }

    /**
     * Translates app publish payload to UBC format
     * Fetches location data from database using one of: ocpi_location_ids, evse_ids, connector_ids, or partner_id
     * Exactly one of these must be provided.
     */
    public static async translateAppPayloadToUBC(payload: PostAppPublishRequestPayload): Promise<{payload: UBCPublishRequestPayload, locations: LocationMapEntry[]}> {
        if (!payload) {
            throw new Error('Payload is required');
        }

        // Validate that exactly one of the 4 fields is present
        const hasLocationIds = payload.ocpi_location_ids && Array.isArray(payload.ocpi_location_ids) && payload.ocpi_location_ids.length > 0;
        const hasEvseIds = payload.evse_ids && Array.isArray(payload.evse_ids) && payload.evse_ids.length > 0;
        const hasConnectorIds = payload.connector_ids && Array.isArray(payload.connector_ids) && payload.connector_ids.length > 0;
        const hasPartnerId = payload.partner_id && typeof payload.partner_id === 'string' && payload.partner_id.length > 0;

        const providedFields = [hasLocationIds, hasEvseIds, hasConnectorIds, hasPartnerId].filter(Boolean);
        
        if (providedFields.length === 0) {
            throw new Error('Exactly one of ocpi_location_ids, evse_ids, connector_ids, or partner_id must be provided');
        }
        
        if (providedFields.length > 1) {
            throw new Error('Only one of ocpi_location_ids, evse_ids, connector_ids, or partner_id can be provided at a time');
        }

        // Fetch locations and build the map based on which field is provided
        const { locationsMap, partner } = await this.fetchLocationsMapFromPayload(payload);

        if (locationsMap.size === 0) {
            throw new Error('No locations found for the provided input');
        }

        // Verify all locations have the same partner (required for single catalog)
        const partners = new Set(Array.from(locationsMap.values()).map(l => l.partner?.id).filter(Boolean));
        if (partners.size > 1) {
            throw new Error('All locations must belong to the same partner');
        }

        if (!partner) {
            throw new Error('Partner not found for locations');
        }

        const transaction_id = Utils.generateUUID();

        // For publish (BPP-only, goes to CDS), we create context without BAP info
        // Note: action is hardcoded as 'catalog_publish' for CDS API
        const context = Utils.getBPPContext({
            action: 'catalog_publish' as BecknAction,
            version: UBCVersion.v2_0_0,
            domain: BecknDomain.EVChargingUBC,
            timestamp: new Date().toISOString(),
            transaction_id: transaction_id,
            message_id: Utils.generateUUID(),
            bpp_uri: Utils.publish_callback_url(),
        });
        
        // Build catalogs from the locations map (already filtered based on input)
        const catalogs = await this.getCatalogsFromLocationsMap(
            locationsMap,
            partner,
            payload.accepted_payment_methods,
            payload.validity,
            payload.availability_windows,
            payload.isActive,
            payload.reservationTime,
        );

        const ubcPublishPayload: UBCPublishRequestPayload = {
            context: context,
            message: {
                catalogs: catalogs,
            },
        };

        return { payload: ubcPublishPayload, locations: Array.from(locationsMap.values()) };
    }

    /**
     * Fetches locations from database and builds a map based on payload input type
     * The map only includes the specific EVSEs/connectors requested (for filtering)
     * Handles ocpi_location_ids, evse_ids, connector_ids, or partner_id
     */
    private static async fetchLocationsMapFromPayload(payload: PostAppPublishRequestPayload): Promise<{
        locationsMap: Map<string, LocationMapEntry>;
        partner: OCPIPartner | null;
    }> {
        const locationsMap = new Map<string, LocationMapEntry>();

        // Case 1: Fetch by partner_id - get all locations with all EVSEs and connectors
        if (payload.partner_id) {
            const locations = await databaseService.prisma.location.findMany({
                where: {
                    partner_id: payload.partner_id,
                    deleted: false,
                },
                include: {
                    evses: {
                        include: {
                            evse_connectors: true,
                        },
                        where: {
                            deleted: false,
                        },
                    },
                    partner: true,
                },
            });

            if (locations.length === 0) {
                throw new Error(`No locations found for partner_id: ${payload.partner_id}`);
            }

            // Build map with all EVSEs and connectors
            for (const location of locations) {
                const evsesMap = new Map<string, EVSE & { connectors: EVSEConnector[] }>();
                
                for (const evse of location.evses) {
                    if (evse.deleted) continue;
                    const connectors = evse.evse_connectors.filter(c => !c.deleted);
                    if (connectors.length > 0) {
                        evsesMap.set(evse.id, {
                            ...evse,
                            connectors: connectors,
                        });
                    }
                }

                if (evsesMap.size > 0) {
                    locationsMap.set(location.id, {
                        ...location,
                        evses: evsesMap,
                        partner: location.partner,
                    });
                }
            }

            logger.info(`Built location map with ${locationsMap.size} locations for partner_id: ${payload.partner_id}`);
            return { locationsMap, partner: locations[0]?.partner || null };
        }

        // Case 2: Fetch by ocpi_location_ids - get all EVSEs and connectors for those locations
        if (payload.ocpi_location_ids && payload.ocpi_location_ids.length > 0) {
            const locations = await databaseService.prisma.location.findMany({
                where: {
                    ocpi_location_id: {
                        in: payload.ocpi_location_ids,
                    },
                    deleted: false,
                },
                include: {
                    evses: {
                        include: {
                            evse_connectors: true,
                        },
                        where: {
                            deleted: false,
                        },
                    },
                    partner: true,
                },
            });

            // Check if all requested locations were found
            const foundLocationIds = new Set(locations.map(l => l.ocpi_location_id));
            const missingLocationIds = payload.ocpi_location_ids.filter(id => !foundLocationIds.has(id));
            if (missingLocationIds.length > 0) {
                logger.warn(`Some locations not found: ${missingLocationIds.join(', ')}`);
            }

            if (locations.length === 0) {
                throw new Error(`No locations found for provided ocpi_location_ids: ${payload.ocpi_location_ids.join(', ')}`);
            }

            // Build map with all EVSEs and connectors for these locations
            for (const location of locations) {
                const evsesMap = new Map<string, EVSE & { connectors: EVSEConnector[] }>();
                
                for (const evse of location.evses) {
                    if (evse.deleted) continue;
                    const connectors = evse.evse_connectors.filter(c => !c.deleted);
                    if (connectors.length > 0) {
                        evsesMap.set(evse.id, {
                            ...evse,
                            connectors: connectors,
                        });
                    }
                }

                if (evsesMap.size > 0) {
                    locationsMap.set(location.id, {
                        ...location,
                        evses: evsesMap,
                        partner: location.partner,
                    });
                }
            }

            logger.info(`Built location map with ${locationsMap.size} locations for ocpi_location_ids`);
            return { locationsMap, partner: locations[0]?.partner || null };
        }

        // Case 3: Fetch by evse_ids - only include those specific EVSEs with all their connectors
        if (payload.evse_ids && payload.evse_ids.length > 0) {
            // Fetch EVSEs with their connectors and location
            const evses = await databaseService.prisma.eVSE.findMany({
                where: {
                    uid: {
                        in: payload.evse_ids,
                    },
                    deleted: false,
                },
                include: {
                    evse_connectors: {
                        where: {
                            deleted: false,
                        },
                    },
                    location: {
                        include: {
                            partner: true,
                        },
                    },
                },
            });

            if (evses.length === 0) {
                throw new Error(`No EVSEs found for provided evse_ids: ${payload.evse_ids.join(', ')}`);
            }

            // Check if all requested EVSEs were found
            const foundEvseIds = new Set(evses.map(e => e.uid));
            const missingEvseIds = payload.evse_ids.filter(id => !foundEvseIds.has(id));
            if (missingEvseIds.length > 0) {
                logger.warn(`Some EVSEs not found: ${missingEvseIds.join(', ')}`);
            }

            // Build map with only the requested EVSEs
            for (const evse of evses) {
                const location = evse.location;
                if (!location || location.deleted) continue;

                const connectors = evse.evse_connectors.filter(c => !c.deleted);
                if (connectors.length === 0) continue;

                // Get or create location entry in map
                let locationEntry = locationsMap.get(location.id);
                if (!locationEntry) {
                    locationEntry = {
                        ...location,
                        evses: new Map(),
                        partner: location.partner,
                    };
                    locationsMap.set(location.id, locationEntry);
                }

                // Add this EVSE with all its connectors
                locationEntry.evses.set(evse.id, {
                    ...evse,
                    connectors: connectors,
                });
            }

            logger.info(`Built location map with ${locationsMap.size} locations for ${payload.evse_ids.length} evse_ids`);
            const firstEvse = evses[0];
            return { locationsMap, partner: firstEvse?.location?.partner || null };
        }

        // Case 4: Fetch by connector_ids - only include those specific connectors
        if (payload.connector_ids && payload.connector_ids.length > 0) {
            const requestedIds = payload.connector_ids;
            // Match internal row id, Beckn connector id, or OCPI connector_id (per-evse; may return multiple rows for same OCPI id on different EVSEs)
            const connectors = await databaseService.prisma.eVSEConnector.findMany({
                where: {
                    deleted: false,
                    OR: [
                        { id: { in: requestedIds } },
                        { beckn_connector_id: { in: requestedIds } },
                        { connector_id: { in: requestedIds } },
                    ],
                },
                include: {
                    evse: {
                        include: {
                            location: {
                                include: {
                                    partner: true,
                                },
                            },
                        },
                    },
                },
            });

            const rowMatchesRequestedId = (c: EVSEConnector, rid: string) =>
                c.id === rid || c.beckn_connector_id === rid || c.connector_id === rid;

            const matchedRequested = new Set<string>();
            for (const c of connectors) {
                for (const rid of requestedIds) {
                    if (rowMatchesRequestedId(c, rid)) {
                        matchedRequested.add(rid);
                    }
                }
            }

            const unmatchedRequested = requestedIds.filter(rid => !matchedRequested.has(rid));

            if (connectors.length === 0 || matchedRequested.size === 0) {
                throw new ValidationError(
                    `No connectors found for connector_ids: ${requestedIds.join(', ')}. ` +
                    'Use evse_connector.id (UUID), beckn_connector_id (IND*…), or OCPI connector_id as stored for that EVSE.',
                );
            }

            if (unmatchedRequested.length > 0) {
                logger.warn(`Some connector_ids had no matching row: ${unmatchedRequested.join(', ')}`);
            }

            // Build map with only the requested connectors
            for (const connector of connectors) {
                const evse = connector.evse;
                if (!evse || evse.deleted) continue;

                const location = evse.location;
                if (!location || location.deleted) continue;

                // Get or create location entry in map
                let locationEntry = locationsMap.get(location.id);
                if (!locationEntry) {
                    locationEntry = {
                        ...location,
                        evses: new Map(),
                        partner: location.partner,
                    };
                    locationsMap.set(location.id, locationEntry);
                }

                // Get or create EVSE entry in location's evses map
                let evseEntry = locationEntry.evses.get(evse.id);
                if (!evseEntry) {
                    evseEntry = {
                        ...evse,
                        connectors: [],
                    };
                    locationEntry.evses.set(evse.id, evseEntry);
                }

                // Add this specific connector
                evseEntry.connectors.push(connector);
            }

            logger.info(`Built location map with ${locationsMap.size} locations for ${payload.connector_ids.length} connector_ids`);
            const firstConnector = connectors[0];
            return { locationsMap, partner: firstConnector?.evse?.location?.partner || null };
        }

        throw new Error('No valid input provided');
    }

    /**
     * Determines vehicle type based on power type
     * DC → 4-WHEELER, otherwise → 2-WHEELER
     */
    private static getVehicleTypeFromConnector(powerType: string): string {
        const isDC = powerType?.toUpperCase() === 'DC';
        return isDC ? "4-WHEELER" : "2-WHEELER";
    }

    /**
     * Normalizes power type for catalog publishing
     * If power type starts with AC (AC_1_PHASE, AC_2_PHASE, etc.), returns AC_3_PHASE
     * Otherwise returns the original power type
     */
    private static getNormalizedPowerType(powerType: string): string {
        if (powerType?.toUpperCase().startsWith('AC')) {
            return 'AC_3_PHASE';
        }
        return powerType;
    }

    private static getNormalizedParkingType(parkingType?: string | null): ParkingType | undefined {
        if (!parkingType) {
            return undefined;
        }

        switch (parkingType.toUpperCase()) {
        case 'ON_STREET':
        case 'ALONG_MOTORWAY':
        case 'PUBLIC':
            return ParkingType.OnStreet;
        case 'PARKING_GARAGE':
        case 'UNDERGROUND_GARAGE':
            return ParkingType.Basement;
        case 'MALL':
            return ParkingType.Mall;
        case 'FUEL_STATION':
        case 'FUELSTATION':
            return ParkingType.FuelStation;
        case 'OFFICE':
            return ParkingType.Office;
        case 'HOTEL':
            return ParkingType.Hotel;
        case 'PARKING_LOT':
        case 'PARKING_TOP':
        case 'ON_DRIVEWAY':
        case 'PRIVATE':
        default:
            return ParkingType.OffStreet;
        }
    }

    /**
     * Max power (kW) for Beckn ChargingService: prefer OCPI max_electric_power (W), else estimate from V×A (W), else 1 kW minimum for validators/CDS.
     */
    private static computeMaxPowerKWFromConnector(connector: EVSEConnector): number {
        const explicitW = connector.max_electric_power != null ? Number(connector.max_electric_power) : 0;
        if (Number.isFinite(explicitW) && explicitW > 0) {
            return explicitW / 1000;
        }
        const v = Number(connector.max_voltage);
        const a = Number(connector.max_amperage);
        if (Number.isFinite(v) && Number.isFinite(a) && v > 0 && a > 0) {
            return (v * a) / 1000;
        }
        return 1;
    }

    /**
     * Builds item attributes for a single connector from database models
     * Item attributes contain connector-level information
     */
    private static getItemAttributesFromConnector(
        connector: EVSEConnector,
        evse: { uid: string },
        location: LocationWithRelations,
        connectorType: string
    ): BecknChargingServiceAttributes {
        const minPowerKW = 1; // Minimum power is 1 kW
        const maxPowerKW = Math.max(minPowerKW, this.computeMaxPowerKWFromConnector(connector));

        const { externalChargingStationId, externalChargePointId } = this.getExternalChargingStationAndChargePointId(connector);

        const attributes: BecknChargingServiceAttributes = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingService/v1/context.jsonld",
            "@type": "ChargingService",
            "connectorType": connectorType,
            "maxPowerKW": maxPowerKW,
            "minPowerKW": minPowerKW,
            "reservationSupported": false,
            "chargingStation": {
                "id": externalChargingStationId,
                "serviceLocation": {
                    "@type": "beckn:Location",
                    "geo": {
                        "type": "Point",
                        "coordinates": [
                            parseFloat(location.longitude),
                            parseFloat(location.latitude)
                        ]
                    },
                    "address": {
                        "streetAddress": location.address,
                        "addressLocality": location.city,
                        "addressRegion": location.state || '',
                        "postalCode": location.postal_code || '',
                        "addressCountry": location.country
                    }
                },
            },
            "amenityFeature": location.facilities || [],
        };

        // Determine charging speed: CCS2 + DC = FAST, else SLOW
        // Check both the converted connectorType and original standard for CCS2
        const isCCS2 = connectorType === ConnectorType.CCS2 || 
                      connector.standard?.toUpperCase() === 'IEC_62196_T2_COMBO' ||
                      connector.standard?.toUpperCase() === 'IEC_62196_T1_COMBO';
        const isDC = connector.power_type?.toUpperCase() === 'DC';
        const chargingSpeed = (isCCS2 && isDC) ? 'FAST' : 'SLOW';
        attributes.chargingSpeed = chargingSpeed;

        // Determine vehicle type based on power type: DC → 4-WHEELER, else → 2-WHEELER
        const vehicleType = this.getVehicleTypeFromConnector(connector.power_type || '');
        attributes.vehicleType = vehicleType;

        // Only include optional fields if they have values (avoid undefined in JSON)
        if (evse.uid) attributes.evseId = externalChargePointId;
        const normalizedParkingType = this.getNormalizedParkingType(location.parking_type);
        if (normalizedParkingType) attributes.parkingType = normalizedParkingType;
        if (connector.power_type) attributes.powerType = this.getNormalizedPowerType(connector.power_type);
        if (connector.format) attributes.connectorFormat = connector.format;

        return attributes;
    }

    public static getExternalChargingStationAndChargePointId(connector: EVSEConnector): { externalChargingStationId: string, externalChargePointId: string } {
        const becknConnectorId = connector.beckn_connector_id;
        
        if (!becknConnectorId) {
            throw new Error('Beckn connector ID is required');
        }

        const splitByStar = becknConnectorId.split('*');
        const externalChargingStationId = splitByStar[2];
        const externalChargePointId = splitByStar[3];
        return {
            externalChargingStationId: externalChargingStationId,
            externalChargePointId: externalChargePointId,
        };
    }

    /**
     * Builds catalogs from a pre-built locations map
     * The map already contains only the specific EVSEs/connectors to be published
     */
    private static async getCatalogsFromLocationsMap(
        locationsMap: Map<string, LocationMapEntry>,
        partner: OCPIPartner,
        acceptedPaymentMethods?: string[],
        validity?: { start_date: string; end_date: string },
        availabilityWindows?: Array<{ start_time: string; end_time: string }>,
        isActive?: boolean,
        reservationTime?: number,
        bpp_id?: string,
        bpp_uri?: string,
    ): Promise<BecknCatalog[]> {
        bpp_id = bpp_id || Utils.getBppId();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        bpp_uri = bpp_uri || Utils.getBppUri();
        
        // Default accepted payment methods if not provided
        const paymentMethods = acceptedPaymentMethods && acceptedPaymentMethods.length > 0
            ? acceptedPaymentMethods as AcceptedPaymentMethod[]
            : [AcceptedPaymentMethod.UPI, AcceptedPaymentMethod.BANK_TRANSFER];

        if (locationsMap.size === 0) {
            logger.warn('🟡 No locations in map, returning empty catalog');
            throw new Error('No locations in map');
        }

        const catalogs: BecknCatalog[] = [];

        const allTariffIdsSet = new Set<string>(Array.from(locationsMap.values()).flatMap(location => Array.from(location.evses.values()).flatMap(evse => evse.connectors.flatMap(connector => connector.tariff_ids || []))));
        const tariffs = await TariffDbService.getByOcpiTariffIds(Array.from(allTariffIdsSet));
        const tariffsMap = new Map<string, TariffWithRelations>(tariffs.map(tariff => [tariff.ocpi_tariff_id, tariff]));

        for (const [, location] of locationsMap.entries()) {
            // Determine availability windows for this location
            let locationAvailabilityWindows: Array<{ "@type": ObjectType.timePeriod; "schema:startTime": string; "schema:endTime": string }> = [];
            
            if (availabilityWindows && availabilityWindows.length > 0) {
                // Use provided availability windows - convert to UTC format (ending with Z)
                locationAvailabilityWindows = availabilityWindows.map(window => ({
                    "@type": ObjectType.timePeriod,
                    "schema:startTime": convertToUTC(window.start_time),
                    "schema:endTime": convertToUTC(window.end_time),
                }));
            } 
            else {
                // Calculate from opening hours for the next 7 days
                const openingHours = location.opening_times as OCPIHours | null;
                const calculatedWindows = calculateAvailabilityWindowsFromOpeningHours(openingHours, reservationTime);
                locationAvailabilityWindows = calculatedWindows.map(window => ({
                    "@type": ObjectType.timePeriod,
                    "schema:startTime": window.start_time,
                    "schema:endTime": window.end_time,
                }));
            }

            // Convert location map entry to LocationWithRelations format for getItemAttributesFromConnector
            const locationWithRelations: LocationWithRelations = {
                ...location,
                evses: Array.from(location.evses.values()).map(evse => ({
                    ...evse,
                    evse_connectors: evse.connectors,
                })),
            };

            for (const [, evse] of location.evses.entries()) {
                for (const connector of evse.connectors) {
                    // Use beckn_connector_id from connector record if available, otherwise generate (for backwards compatibility)
                    const becknConnectorId = connector.beckn_connector_id;

                    if (!becknConnectorId) {
                        continue;
                    }
                    
                    const locationName = location.name || location.ocpi_location_id;
                    // Convert OCPI connector standard to normal ConnectorType
                    const connectorType = convertOcpiStandardToConnectorType(connector.standard) as ConnectorType;

                    if (!connectorType) {
                        logger.warn(`🟡 No connector type found for connector ${becknConnectorId}`);
                        continue;
                    }

                    if (![ConnectorType.CCS2, ConnectorType.CHAdeMO, ConnectorType.GBT, ConnectorType.Type2].includes(connectorType)) {
                        logger.warn(`🟡 Invalid connector type found for connector ${becknConnectorId}, connector type: ${connectorType}`);
                        continue;
                    }

                    const physicalReference = this.getPhysicalReference(evse);

                    const item: BecknItem = {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
                        "@type": ObjectType.item,
                        "beckn:id": becknConnectorId,
                        "beckn:descriptor": {
                            "@type": ObjectType.descriptor,
                            "schema:name": `${locationName} - ${connectorType}`,
                            "beckn:shortDesc": physicalReference,
                            "beckn:longDesc": `Look for ${physicalReference} Connector ${connector.connector_id}`,
                        },
                        "beckn:category": {
                            "@type": "schema:CategoryCode",
                            "schema:codeValue": "ev-charging",
                            "schema:name": "EV Charging",
                        },
                        "beckn:availabilityWindow": locationAvailabilityWindows.length > 0 ? locationAvailabilityWindows : undefined,
                        "beckn:isActive": isActive !== undefined ? isActive : true,
                        "beckn:rateable": false,
                        "beckn:provider": {
                            "beckn:id": `${partner.country_code}*${partner.party_id}`,
                            "beckn:descriptor": {
                                "@type": ObjectType.descriptor,
                                "schema:name": partner.name || `${partner.country_code}*${partner.party_id}`,
                            },
                        },
                        "beckn:itemAttributes": this.getItemAttributesFromConnector(connector, evse, locationWithRelations, connectorType),
                    };

                    const tariff = tariffsMap.get(connector.tariff_ids[0]);

                    if (!tariff) {
                        logger.warn(`🟡 No tariff found for connector ${becknConnectorId}`);
                        continue;
                    }

                    const ocpiTariff = TariffDbService.mapPrismaTariffToOcpi(tariff);
            
                    // Extract price from tariff elements (OCPI structure)
                    let priceValue = 0;
                    const tariffElements = ocpiTariff.elements || [];
                    if (tariffElements.length > 0) {
                        // Prefer first ENERGY component, else first component (CDS often rejects 0)
                        for (const el of tariffElements) {
                            const pcs = el.price_components || [];
                            const energy = pcs.find((p) => p.type === 'ENERGY');
                            const pick = energy ?? pcs[0];
                            if (pick && typeof pick.price === 'number' && pick.price > 0) {
                                priceValue = pick.price;
                                break;
                            }
                        }
                    }
                    if (priceValue === 0 && ocpiTariff.min_price?.excl_vat != null && ocpiTariff.min_price.excl_vat > 0) {
                        priceValue = ocpiTariff.min_price.excl_vat;
                    }

                    // Determine validity dates - ensure ISO 8601 datetime format with timezone
                    let startDate: string;
                    let endDate: string;
                    
                    if (validity?.start_date && validity?.end_date) {
                        // Use provided validity dates
                        startDate = this.formatValidityDate(validity.start_date, true); // start of day
                        endDate = this.formatValidityDate(validity.end_date, false); // end of day
                    } 
                    else {
                        // Use tariff validity dates or defaults
                        const defaultStart = ocpiTariff.start_date_time || new Date().toISOString();
                        const defaultEnd = ocpiTariff.end_date_time || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year from now
                        startDate = this.formatValidityDate(defaultStart, true);
                        endDate = this.formatValidityDate(defaultEnd, false);
                    }

                    // One catalog per connector; offer id must be unique within catalog_publish (shared OCPI tariff id is not)
                    const offerBecknId = `${tariff.ocpi_tariff_id}*${becknConnectorId}`;
                    const offer: BecknCatalogOffer = {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
                        "beckn:provider": `${partner.country_code}*${partner.party_id}`,
                        "@type": ObjectType.offer,
                        "beckn:id": offerBecknId,
                        "beckn:descriptor": {
                            "@type": ObjectType.descriptor,
                            "schema:name": `Tariff ${tariff.ocpi_tariff_id}`,
                        },
                        "beckn:items": [becknConnectorId],
                        "beckn:price": {
                            "currency": tariff.currency,
                            "value": priceValue,
                            "applicableQuantity": {
                                "unitText": "Kilowatt Hour",
                                "unitCode": "KWH",
                                "unitQuantity": 1,
                            },
                        },
                        "beckn:validity": {
                            "@type": ObjectType.timePeriod,
                            "schema:startDate": startDate,
                            "schema:endDate": endDate,
                        },
                        "beckn:acceptedPaymentMethod": paymentMethods,
                        "beckn:offerAttributes": {
                            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/EvChargingOffer/v1/context.jsonld",
                            "@type": ObjectType.chargingOffer,
                            "idleFeePolicy": {
                                "applicableQuantity": {
                                    unitCode: "MIN",
                                    unitQuantity: 10,
                                    unitText: "minutes",
                                },
                                "currency": tariff.currency,
                                value: 0
                            },
                            tariffModel: "PER_KWH"
                        },
                    };

                    if (!connector.ubc_catalog_id) {
                        try {
                            const catalogId = Utils.generateUUID();
                            const updatedConnector = await EvseConnectorDbService.updateUBCCatalogId(connector.id, catalogId);
                            if (!updatedConnector || !updatedConnector.ubc_catalog_id) {
                                logger.error(`🟡 Error updating UBC catalog id for connector ${becknConnectorId}`);
                                continue;
                            }
                            connector.ubc_catalog_id = updatedConnector.ubc_catalog_id;
                        }
                        catch (error) {
                            logger.error(`🟡 Error generating UBC catalog id for connector ${becknConnectorId}`, error as Error);
                            continue;
                        }
                    }

                    const catalog: BecknCatalog = {
                        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
                        "@type": "beckn:Catalog",
                        "beckn:id": connector.ubc_catalog_id,
                        "beckn:descriptor": {
                            "@type": ObjectType.descriptor,
                            "schema:name": `${Utils.getBppId()} Charging Network`,
                            "beckn:shortDesc": "Comprehensive network of charging stations",
                        },
                        "beckn:bppId": Utils.getBppId(),
                        "beckn:bppUri": Utils.getBppUri(),
                        "beckn:items": [item],
                        "beckn:offers": [offer],
                    };

                    catalogs.push(catalog);
                }
            }
        }

        return catalogs;
    }

    /**
     * Sends publish request to beckn-ONIX (BPP)
     * This is the function called by getStitchedResponse
     */
    public static async sendPublishCallToBecknONIX(payload: UBCPublishRequestPayload): Promise<UBCPublishResponsePayload> {
        const bppHost = Utils.publish_gateway_url();
        logger.debug(`🟡 Sending publish request to BPP ONIX`, { 
            url: `${bppHost}/${BecknAction.publish}`,
            transaction_id: payload.context.transaction_id 
        });

        return await BppOnixRequestService.sendPostRequest({
            url: `${bppHost}/${BecknAction.publish}`,
            data: payload,
        }, BecknDomain.EVChargingUBC);
    }

    public static async updateConnectorsAfterPublish(locations: LocationMapEntry[], response: AppPublishResponsePayload, isActive: boolean): Promise<{
        totalCount: number,
    }> {
        try {
            // Update the charge point connector for published items with fields: ubc_publish_enabled, ubc_publish_info
            let totalCount = 0;
            const { results } = response.message;
            const catalogIdChargePointConnectorMap: Record<string, EVSEConnector> = {};

            locations.forEach((location) => {
                location.evses.forEach((evse) => {
                    evse.connectors.forEach((connector) => {
                        if (connector.ubc_catalog_id) {
                            catalogIdChargePointConnectorMap[connector.ubc_catalog_id] = connector;
                        }
                    });
                });
            });   

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const { catalog_id, status, item_count } = result;
                
                // Update the charge point connector
                const connector = catalogIdChargePointConnectorMap[catalog_id];

                if (connector) {
                    const ubcPublishInfo = (connector.ubc_publish_info || {}) as UBCPublishInfo;
                    const updateFields: Prisma.EVSEConnectorUpdateInput = {
                        ubc_publish_enabled: 'true',
                    };

                    ubcPublishInfo.last_published_item_info = {
                        updated_on: new Date().toISOString(),
                        is_active: isActive,
                        ...result,
                    };

                    let currentlyActive = ubcPublishInfo?.currently_is_active || false;

                    if (status === 'ACCEPTED') {
                        ubcPublishInfo.last_successfully_published_at = new Date().toISOString();
                        totalCount += item_count;

                        currentlyActive = isActive;
                    }

                    ubcPublishInfo.currently_is_active = currentlyActive;
                    updateFields.ubc_publish_info = ubcPublishInfo;
        
                    // eslint-disable-next-line no-await-in-loop
                    await EvseConnectorDbService.updateEVSEConnector(connector.id, updateFields);

                    // eslint-disable-next-line no-await-in-loop
                    await Utils.sleep(100);
                }
            }

            return {
                totalCount: totalCount,
            };

        }
        catch (error) {
            logger.error(`Failed to update connectors after publish`, error as Error);

            return {
                totalCount: 0,
            };
        }
    }
}
