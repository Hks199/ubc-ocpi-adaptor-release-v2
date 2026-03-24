import { Prisma, Location, EVSE, EVSEConnector } from '@prisma/client';
import {
    OCPILocation,
    OCPIEVSE,
    OCPIConnector,
} from '../../../../schema/modules/locations/types';
import { isEqual } from 'lodash';
import { logger } from '../../../../../services/logger.service';
import { LocationDbService } from '../../../../../db-services/LocationDbService';
import Utils from '../../../../../utils/Utils';

/**
 * Service for building create and update fields from OCPI payloads
 * Only includes fields that are present in the payload
 */
export class LocationService {
    /**
     * Build location create fields from OCPI payload - only includes fields present in payload
     */
    public static buildLocationCreateFields(
        payload: OCPILocation,
        partnerId: string,
    ): Prisma.LocationUncheckedCreateInput {
        const reqId = 'internal';
        const logData = { action: 'buildLocationCreateFields', partnerId, locationId: payload.id };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildLocationCreateFields in LocationService`, { data: logData });

            // Generate external_object_id for beckn_connector_id generation
            const externalObjectId = Utils.generateNanoId(9);

            const locationCreateFields: Prisma.LocationUncheckedCreateInput = {
            partner_id: partnerId,
            ocpi_location_id: payload.id,
            country_code: payload.country_code,
            party_id: payload.party_id,
            city: payload.city,
            country: payload.country,
            address: payload.address,
            time_zone: payload.time_zone,
            latitude: payload.coordinates.latitude,
            longitude: payload.coordinates.longitude,
            last_updated: new Date(payload.last_updated),
            deleted: false,
            external_object_id: externalObjectId,
        };

        if (payload.publish !== undefined) locationCreateFields.publish = payload.publish;
        if (payload.publish_allowed_to !== undefined) locationCreateFields.publish_allowed_to = payload.publish_allowed_to as Prisma.InputJsonValue;
        if (payload.name !== undefined) locationCreateFields.name = payload.name;
        if (payload.postal_code !== undefined) locationCreateFields.postal_code = payload.postal_code;
        if (payload.state !== undefined) locationCreateFields.state = payload.state;
        if (payload.related_locations !== undefined) locationCreateFields.related_locations = payload.related_locations as Prisma.InputJsonValue;
        if (payload.parking_type !== undefined) locationCreateFields.parking_type = payload.parking_type;
        if (payload.operator !== undefined) locationCreateFields.operator = payload.operator as Prisma.InputJsonValue;
        if (payload.suboperator !== undefined) locationCreateFields.suboperator = payload.suboperator as Prisma.InputJsonValue;
        if (payload.owner !== undefined) locationCreateFields.owner = payload.owner as Prisma.InputJsonValue;
        if (payload.facilities !== undefined) locationCreateFields.facilities = payload.facilities;
        if (payload.opening_times !== undefined) locationCreateFields.opening_times = payload.opening_times as unknown as Prisma.InputJsonValue;
        if (payload.charging_when_closed !== undefined) locationCreateFields.charging_when_closed = payload.charging_when_closed;
        if (payload.images !== undefined) locationCreateFields.images = payload.images as Prisma.InputJsonValue;
        if (payload.energy_mix !== undefined) locationCreateFields.energy_mix = payload.energy_mix as Prisma.InputJsonValue;

            logger.debug(`🟢 [${reqId}] Completed buildLocationCreateFields in LocationService`, { 
                data: { ...logData, fieldCount: Object.keys(locationCreateFields).length } 
            });

            return locationCreateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildLocationCreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build location update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildLocationUpdateFields(
        payload: OCPILocation,
        existing?: Location | null,
    ): Prisma.LocationUncheckedUpdateInput {
        const reqId = 'internal';
        const logData = { action: 'buildLocationUpdateFields', locationId: payload.id, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildLocationUpdateFields in LocationService`, { data: logData });

            const locationUpdateFields: Prisma.LocationUncheckedUpdateInput = {};

        if (payload.country_code !== undefined && (!existing || existing.country_code !== payload.country_code)) {
            locationUpdateFields.country_code = payload.country_code;
        }
        if (payload.party_id !== undefined && (!existing || existing.party_id !== payload.party_id)) {
            locationUpdateFields.party_id = payload.party_id;
        }
        if (payload.publish !== undefined && (!existing || existing.publish !== payload.publish)) {
            locationUpdateFields.publish = payload.publish;
        }
        if (payload.publish_allowed_to !== undefined && (!existing || !isEqual(existing.publish_allowed_to, payload.publish_allowed_to))) {
            locationUpdateFields.publish_allowed_to = payload.publish_allowed_to as Prisma.InputJsonValue;
        }
        if (payload.name !== undefined && (!existing || existing.name !== payload.name)) {
            locationUpdateFields.name = payload.name;
        }
        if (payload.address !== undefined && (!existing || existing.address !== payload.address)) {
            locationUpdateFields.address = payload.address;
        }
        if (payload.city !== undefined && (!existing || existing.city !== payload.city)) {
            locationUpdateFields.city = payload.city;
        }
        if (payload.postal_code !== undefined && (!existing || existing.postal_code !== payload.postal_code)) {
            locationUpdateFields.postal_code = payload.postal_code;
        }
        if (payload.state !== undefined && (!existing || existing.state !== payload.state)) {
            locationUpdateFields.state = payload.state;
        }
        if (payload.country !== undefined && (!existing || existing.country !== payload.country)) {
            locationUpdateFields.country = payload.country;
        }
        if (payload.coordinates !== undefined) {
            const latChanged = !existing || existing.latitude !== payload.coordinates.latitude;
            const lonChanged = !existing || existing.longitude !== payload.coordinates.longitude;
            if (latChanged || lonChanged) {
                locationUpdateFields.latitude = payload.coordinates.latitude;
                locationUpdateFields.longitude = payload.coordinates.longitude;
            }
        }
        if (payload.related_locations !== undefined && (!existing || !isEqual(existing.related_locations, payload.related_locations))) {
            locationUpdateFields.related_locations = payload.related_locations as Prisma.InputJsonValue;
        }
        if (payload.parking_type !== undefined && (!existing || existing.parking_type !== payload.parking_type)) {
            locationUpdateFields.parking_type = payload.parking_type;
        }
        if (payload.operator !== undefined && (!existing || !isEqual(existing.operator, payload.operator))) {
            locationUpdateFields.operator = payload.operator as Prisma.InputJsonValue;
        }
        if (payload.suboperator !== undefined && (!existing || !isEqual(existing.suboperator, payload.suboperator))) {
            locationUpdateFields.suboperator = payload.suboperator as Prisma.InputJsonValue;
        }
        if (payload.owner !== undefined && (!existing || !isEqual(existing.owner, payload.owner))) {
            locationUpdateFields.owner = payload.owner as Prisma.InputJsonValue;
        }
        if (payload.facilities !== undefined && (!existing || !isEqual(existing.facilities, payload.facilities))) {
            locationUpdateFields.facilities = payload.facilities;
        }
        if (payload.time_zone !== undefined && (!existing || existing.time_zone !== payload.time_zone)) {
            locationUpdateFields.time_zone = payload.time_zone;
        }
        if (payload.opening_times !== undefined && (!existing || !isEqual(existing.opening_times, payload.opening_times))) {
            locationUpdateFields.opening_times = payload.opening_times as unknown as Prisma.InputJsonValue;
        }
        if (payload.charging_when_closed !== undefined && (!existing || existing.charging_when_closed !== payload.charging_when_closed)) {
            locationUpdateFields.charging_when_closed = payload.charging_when_closed;
        }
        if (payload.images !== undefined && (!existing || !isEqual(existing.images, payload.images))) {
            locationUpdateFields.images = payload.images as Prisma.InputJsonValue;
        }
        if (payload.energy_mix !== undefined && (!existing || !isEqual(existing.energy_mix, payload.energy_mix))) {
            locationUpdateFields.energy_mix = payload.energy_mix as Prisma.InputJsonValue;
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated);
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                locationUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildLocationUpdateFields in LocationService`, { 
                data: { ...logData, fieldCount: Object.keys(locationUpdateFields).length } 
            });

            return locationUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildLocationUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build EVSE create fields from OCPI payload - only includes fields present in payload
     */
    public static buildEVSECreateFields(
        payload: OCPIEVSE,
        locationId: string,
        partnerId: string,
    ): Prisma.EVSEUncheckedCreateInput {
        const reqId = 'internal';
        const logData = { action: 'buildEVSECreateFields', locationId, partnerId, evseUid: payload.uid };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildEVSECreateFields in LocationService`, { data: logData });

            // Generate external_object_id for beckn_connector_id generation
            const externalObjectId = Utils.generateNanoId(9);

            const evseCreateFields: Prisma.EVSEUncheckedCreateInput = {
            location_id: locationId,
            partner_id: partnerId,
            uid: payload.uid,
            status: payload.status,
            last_updated: new Date(payload.last_updated),
            deleted: false,
            external_object_id: externalObjectId,
        };

        if (payload.evse_id !== undefined) evseCreateFields.evse_id = payload.evse_id;
        if (payload.status_schedule !== undefined) evseCreateFields.status_schedule = payload.status_schedule as Prisma.InputJsonValue;
        if (payload.capabilities !== undefined) evseCreateFields.capabilities = payload.capabilities;
        if (payload.floor_level !== undefined) evseCreateFields.floor_level = payload.floor_level;
        if (payload.coordinates !== undefined) {
            evseCreateFields.latitude = payload.coordinates.latitude;
            evseCreateFields.longitude = payload.coordinates.longitude;
        }
        if (payload.physical_reference !== undefined) evseCreateFields.physical_reference = payload.physical_reference;
        if (payload.directions !== undefined) evseCreateFields.directions = payload.directions as Prisma.InputJsonValue;
        if (payload.parking_restrictions !== undefined) evseCreateFields.parking_restrictions = payload.parking_restrictions;
        if (payload.images !== undefined) evseCreateFields.images = payload.images as Prisma.InputJsonValue;
        if (payload.status_errorcode !== undefined) evseCreateFields.status_errorcode = payload.status_errorcode;
        if (payload.status_errordescription !== undefined) evseCreateFields.status_errordescription = payload.status_errordescription;

            logger.debug(`🟢 [${reqId}] Completed buildEVSECreateFields in LocationService`, { 
                data: { ...logData, fieldCount: Object.keys(evseCreateFields).length } 
            });

            return evseCreateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildEVSECreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build EVSE update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildEVSEUpdateFields(
        payload: OCPIEVSE,
        existing?: EVSE | null,
    ): Prisma.EVSEUncheckedUpdateInput {
        const reqId = 'internal';
        const logData = { action: 'buildEVSEUpdateFields', evseUid: payload.uid, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildEVSEUpdateFields in LocationService`, { data: logData });

            const evseUpdateFields: Prisma.EVSEUncheckedUpdateInput = {};

        if (payload.uid !== undefined && (!existing || existing.uid !== payload.uid)) {
            evseUpdateFields.uid = payload.uid;
        }
        if (payload.evse_id !== undefined && (!existing || existing.evse_id !== payload.evse_id)) {
            evseUpdateFields.evse_id = payload.evse_id;
        }
        if (payload.status !== undefined && (!existing || existing.status !== payload.status)) {
            evseUpdateFields.status = payload.status;
        }
        if (payload.status_schedule !== undefined && (!existing || !isEqual(existing.status_schedule, payload.status_schedule))) {
            evseUpdateFields.status_schedule = payload.status_schedule as Prisma.InputJsonValue;
        }
        if (payload.capabilities !== undefined && (!existing || !isEqual(existing.capabilities, payload.capabilities))) {
            evseUpdateFields.capabilities = payload.capabilities;
        }
        if (payload.floor_level !== undefined && (!existing || existing.floor_level !== payload.floor_level)) {
            evseUpdateFields.floor_level = payload.floor_level;
        }
        if (payload.coordinates !== undefined) {
            const latChanged = !existing || existing.latitude !== payload.coordinates.latitude;
            const lonChanged = !existing || existing.longitude !== payload.coordinates.longitude;
            if (latChanged || lonChanged) {
                evseUpdateFields.latitude = payload.coordinates.latitude;
                evseUpdateFields.longitude = payload.coordinates.longitude;
            }
        }
        if (payload.physical_reference !== undefined && (!existing || existing.physical_reference !== payload.physical_reference)) {
            evseUpdateFields.physical_reference = payload.physical_reference;
        }
        if (payload.directions !== undefined && (!existing || !isEqual(existing.directions, payload.directions))) {
            evseUpdateFields.directions = payload.directions as Prisma.InputJsonValue;
        }
        if (payload.parking_restrictions !== undefined && (!existing || !isEqual(existing.parking_restrictions, payload.parking_restrictions))) {
            evseUpdateFields.parking_restrictions = payload.parking_restrictions;
        }
        if (payload.images !== undefined && (!existing || !isEqual(existing.images, payload.images))) {
            evseUpdateFields.images = payload.images as Prisma.InputJsonValue;
        }
        if (payload.status_errorcode !== undefined && (!existing || existing.status_errorcode !== payload.status_errorcode)) {
            evseUpdateFields.status_errorcode = payload.status_errorcode;
        }
        if (payload.status_errordescription !== undefined && (!existing || existing.status_errordescription !== payload.status_errordescription)) {
            evseUpdateFields.status_errordescription = payload.status_errordescription;
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated);
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                evseUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildEVSEUpdateFields in LocationService`, { 
                data: { ...logData, fieldCount: Object.keys(evseUpdateFields).length } 
            });

            return evseUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildEVSEUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build connector create fields from OCPI payload - only includes fields present in payload
     * @param payload - OCPI connector payload
     * @param evseId - Internal EVSE ID
     * @param partnerId - Partner ID
     * @param locationExternalObjectId - Location's external_object_id (required for beckn_connector_id generation)
     * @param evseExternalObjectId - EVSE's external_object_id (required for beckn_connector_id generation)
     * @param ubcPartyId - UBC party ID (default: TPC)
     */
    public static buildConnectorCreateFields(
        payload: OCPIConnector & { connector_id?: string },
        evseId: string,
        partnerId: string,
        locationExternalObjectId: string,
        evseExternalObjectId: string,
        ubcPartyId: string = 'TPC',
    ): Prisma.EVSEConnectorUncheckedCreateInput {
        const reqId = 'internal';
        const connectorId = (payload as any).connector_id ?? payload.id;
        const logData = { action: 'buildConnectorCreateFields', evseId, partnerId, connectorId };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildConnectorCreateFields in LocationService`, { data: logData });

            // Generate beckn_connector_id - required field
            // Format: IND*{ubcPartyId}*{location.external_object_id}*{evse.external_object_id}*{connector_id}
            const becknConnectorId = LocationDbService.generateBecknConnectorId(
                ubcPartyId,
                locationExternalObjectId,
                evseExternalObjectId,
                connectorId,
            );

            const connectorCreateFields: Prisma.EVSEConnectorUncheckedCreateInput = {
            evse_id: evseId,
            partner_id: partnerId,
            connector_id: connectorId,
            standard: payload.standard,
            format: payload.format,
            power_type: payload.power_type,
            max_voltage: BigInt(payload.max_voltage),
            max_amperage: BigInt(payload.max_amperage),
            last_updated: new Date(payload.last_updated),
            deleted: false,
            beckn_connector_id: becknConnectorId,
        };

        if (payload.qr_code !== undefined) connectorCreateFields.qr_code = payload.qr_code;
        if (payload.max_electric_power !== undefined) connectorCreateFields.max_electric_power = BigInt(payload.max_electric_power);
        if (payload.terms_and_conditions !== undefined) connectorCreateFields.terms_and_conditions = payload.terms_and_conditions;
        if (payload.tariff_ids !== undefined) connectorCreateFields.tariff_ids = payload.tariff_ids;

            logger.debug(`🟢 [${reqId}] Completed buildConnectorCreateFields in LocationService`, { 
                data: { ...logData, fieldCount: Object.keys(connectorCreateFields).length, becknConnectorId } 
            });

            return connectorCreateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildConnectorCreateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * Build connector update fields from OCPI payload - only includes fields present in payload that have changed
     */
    public static buildConnectorUpdateFields(
        payload: OCPIConnector & { connector_id?: string },
        existing?: EVSEConnector | null,
    ): Prisma.EVSEConnectorUncheckedUpdateInput {
        const reqId = 'internal';
        const connectorId = (payload as any).connector_id ?? payload.id;
        const logData = { action: 'buildConnectorUpdateFields', connectorId, hasExisting: !!existing };

        try {
            logger.debug(`🟡 [${reqId}] Starting buildConnectorUpdateFields in LocationService`, { data: logData });

            const connectorUpdateFields: Prisma.EVSEConnectorUncheckedUpdateInput = {};

        if ((payload.id !== undefined || (payload as any).connector_id !== undefined) && (!existing || existing.connector_id !== connectorId)) {
            connectorUpdateFields.connector_id = connectorId;
        }
        if (payload.standard !== undefined && (!existing || existing.standard !== payload.standard)) {
            connectorUpdateFields.standard = payload.standard;
        }
        if (payload.format !== undefined && (!existing || existing.format !== payload.format)) {
            connectorUpdateFields.format = payload.format;
        }
        if (payload.qr_code !== undefined && (!existing || existing.qr_code !== payload.qr_code)) {
            connectorUpdateFields.qr_code = payload.qr_code;
        }
        if (payload.power_type !== undefined && (!existing || existing.power_type !== payload.power_type)) {
            connectorUpdateFields.power_type = payload.power_type;
        }
        if (payload.max_voltage !== undefined) {
            const payloadMaxVoltage = BigInt(payload.max_voltage);
            if (!existing || existing.max_voltage !== payloadMaxVoltage) {
                connectorUpdateFields.max_voltage = payloadMaxVoltage;
            }
        }
        if (payload.max_amperage !== undefined) {
            const payloadMaxAmperage = BigInt(payload.max_amperage);
            if (!existing || existing.max_amperage !== payloadMaxAmperage) {
                connectorUpdateFields.max_amperage = payloadMaxAmperage;
            }
        }
        if (payload.max_electric_power !== undefined) {
            const payloadMaxElectricPower = BigInt(payload.max_electric_power);
            if (!existing || existing.max_electric_power !== payloadMaxElectricPower) {
                connectorUpdateFields.max_electric_power = payloadMaxElectricPower;
            }
        }
        if (payload.terms_and_conditions !== undefined && (!existing || existing.terms_and_conditions !== payload.terms_and_conditions)) {
            connectorUpdateFields.terms_and_conditions = payload.terms_and_conditions;
        }
        if (payload.tariff_ids !== undefined && (!existing || !isEqual(existing.tariff_ids, payload.tariff_ids))) {
            connectorUpdateFields.tariff_ids = payload.tariff_ids;
        }
        if (payload.last_updated !== undefined) {
            const payloadLastUpdated = new Date(payload.last_updated);
            if (!existing || existing.last_updated.getTime() !== payloadLastUpdated.getTime()) {
                connectorUpdateFields.last_updated = payloadLastUpdated;
            }
        }

            logger.debug(`🟢 [${reqId}] Completed buildConnectorUpdateFields in LocationService`, { 
                data: { ...logData, fieldCount: Object.keys(connectorUpdateFields).length } 
            });

            return connectorUpdateFields;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in buildConnectorUpdateFields: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}

