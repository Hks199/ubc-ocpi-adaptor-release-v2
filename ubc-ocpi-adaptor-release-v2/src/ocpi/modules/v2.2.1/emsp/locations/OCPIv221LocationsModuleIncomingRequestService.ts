import { Request, Response } from 'express';
import { OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPILocation,
    OCPIEVSE,
    OCPIConnector,
    OCPIPatchLocation,
    OCPIPatchEVSE,
    OCPIPatchConnector,
} from '../../../../schema/modules/locations/types';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { databaseService } from '../../../../../services/database.service';
import { LocationDbService, LocationWithRelations } from '../../../../../db-services/LocationDbService';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import { LocationService } from './LocationService';
import { isEmpty } from 'lodash';
import { logger } from '../../../../../services/logger.service';
import { OCPIPartnerAdditionalProps } from '../../../../../types/OCPIPartner';

/**
 * Handle all incoming requests for the Locations module from the CPO
 */
export default class OCPIv221LocationsModuleIncomingRequestService {

    /**
     * Get the UBC party ID from the partner's additional_props
     * @param partnerId - Partner ID
     * @returns UBC party ID (default: 'TPC')
     */
    private static async getUbcPartyId(partnerId: string): Promise<string> {
        try {
            const partner = await databaseService.prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                select: { additional_props: true },
            });
            
            const additionalProps = partner?.additional_props as OCPIPartnerAdditionalProps | null;
            return additionalProps?.ubc_party_id ?? 'TPC';
        }
        catch (e) {
            logger.warn('Failed to get ubc_party_id from partner, using default TPC', { partnerId, error: e });
            return 'TPC';
        }
    }

    // get requests

    public static async handleGetLocations(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'GET /locations', partnerId: partnerCredentials.partner_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /locations in handleGetLocations`, { data: logData });

            // Log incoming request (non-blocking)
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetLocationsReq,
            });

            logger.debug(`🟡 [${reqId}] Parsing query parameters in handleGetLocations`, { 
                data: { logData, query: req.query } 
            });
            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;

            logger.debug(`🟡 [${reqId}] Fetching locations from DB in handleGetLocations`, { 
                data: { logData, limit, offset } 
            });
            const prismaLocations = await databaseService.prisma.location.findMany({
                take: limit,
                skip: offset,
                where: {
                    deleted: false,
                    partner_id: partnerCredentials.partner_id,
                },
                include: {
                    evses: {
                        include: {
                            evse_connectors: true,
                        },
                    },
                },
                orderBy: {
                    last_updated: 'desc',
                },
            });

            logger.debug(`🟢 [${reqId}] Fetched ${prismaLocations.length} locations from DB in handleGetLocations`, { 
                data: { logData, locationsCount: prismaLocations.length } 
            });

            logger.debug(`🟡 [${reqId}] Mapping Prisma locations to OCPI format in handleGetLocations`, { data: logData });
            const ocpiLocations: OCPILocation[] = prismaLocations.map((loc) =>
                LocationDbService.mapPrismaLocationToOcpi(loc as LocationWithRelations),
            );

            const response = OCPIResponseService.success<OCPILocation[]>(ocpiLocations);

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 200,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetLocationsRes,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /locations response in handleGetLocations`, { 
                data: { logData, httpStatus: response.httpStatus, locationsCount: ocpiLocations.length } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetLocations: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    public static async handleGetLocation(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const { location_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
        };
        const logData = { action: 'GET /locations/:location_id', partnerId: partnerCredentials.partner_id, location_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting GET /locations/:location_id in handleGetLocation`, { data: logData });

            // Log incoming request (non-blocking)
            // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetLocationReq,
                ocpi_location_id: location_id,
            });

            logger.debug(`🟡 [${reqId}] Finding location by OCPI ID in handleGetLocation`, { data: logData });
            const prismaLocation = await LocationDbService.findByOcpiLocationId(
                location_id,
                partnerCredentials.partner_id,
            );
            if (!prismaLocation) {
                logger.warn(`🟡 [${reqId}] Location not found in handleGetLocation`, { data: logData });
                const response = OCPIResponseService.clientError<OCPILocation | null>(null);
                // Log outgoing response (non-blocking)
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus ?? 400,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.GetLocationRes,
                });
                return response;
            }

            logger.debug(`🟡 [${reqId}] Mapping Prisma location to OCPI format in handleGetLocation`, { data: logData });
            const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
            const response = OCPIResponseService.success<OCPILocation>(ocpiLocation);

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 200,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetLocationRes,
                location_id: prismaLocation.id,
            });

            logger.debug(`🟢 [${reqId}] Returning GET /locations/:location_id response in handleGetLocation`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handleGetLocation: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    public static async handleGetEVSE(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
        };

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetEVSEReq,
            ocpi_location_id: location_id,
            ocpi_evse_uid: evse_uid,
        });

        // Fetch EVSE directly from EVSE table
        const evseRecord = await LocationDbService.findEVSEByLocationAndUid(
            location_id,
            evse_uid,
            partnerCredentials.partner_id,
        );

        if (!evseRecord) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetEVSERes,
            });
            return response;
        }

        const ocpiEvse = LocationDbService.mapPrismaEVSEToOcpi(evseRecord);
        const response = OCPIResponseService.success<OCPIEVSE>(ocpiEvse);

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetEVSERes,
            location_id: evseRecord.location_id,
            evse_id: evseRecord.id,
        });

        return response;
    }

    public static async handleGetConnector(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetConnectorReq,
            ocpi_location_id: location_id,
            ocpi_evse_uid: evse_uid,
            ocpi_connector_id: connector_id,
        });

        // Fetch Connector directly from EVSEConnector table
        const connectorRecord = await LocationDbService.findConnectorByLocationEvseAndConnectorId(
            location_id,
            evse_uid,
            connector_id,
        );

        if (!connectorRecord) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetConnectorRes,
            });
            return response;
        }

        const ocpiConnector = LocationDbService.mapPrismaConnectorToOcpi(connectorRecord);
        const response = OCPIResponseService.success<OCPIConnector>(ocpiConnector);

        // Get location_id from the EVSE
        const evseRecord = await databaseService.prisma.eVSE.findUnique({
            where: { id: connectorRecord.evse_id },
            select: { location_id: true },
        });

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetConnectorRes,
            location_id: evseRecord?.location_id,
            evse_id: connectorRecord.evse_id,
            connector_id: connectorRecord.id,
        });

        return response;
    }

    // put requests

    public static async handlePutLocation(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const { location_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
        };
        const logData = { action: 'PUT /locations/:location_id', partnerId: partnerCredentials.partner_id, location_id };

        try {
            logger.debug(`🟡 [${reqId}] Starting PUT /locations/:location_id in handlePutLocation`, { data: logData });

            // Log incoming request (non-blocking)
            // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
            OCPIRequestLogService.logIncomingRequest({
                req,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutLocationReq,
                ocpi_location_id: location_id,
            });

            logger.debug(`🟡 [${reqId}] Parsing PUT location payload in handlePutLocation`, { 
                data: { logData, hasBody: !!req.body } 
            });
            const payload = req.body as OCPILocation;

            if (!payload || payload.id !== location_id) {
                logger.warn(`🟡 [${reqId}] Invalid payload or location_id mismatch in handlePutLocation`, { 
                    data: { logData, payloadId: payload?.id, expectedId: location_id } 
                });
                const response = OCPIResponseService.clientError<OCPILocation | null>(null);
                OCPIRequestLogService.logIncomingResponse({
                    req,
                    res,
                    responseBody: response.payload,
                    statusCode: response.httpStatus ?? 400,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PutLocationRes,
                });
                return response;
            }

            // Find existing location
            logger.debug(`🟡 [${reqId}] Finding existing location in handlePutLocation`, { data: logData });
            const existingLocation = await LocationDbService.findByOcpiLocationId(
                location_id,
                partnerCredentials.partner_id,
            );

            logger.debug(`🟡 [${reqId}] ${existingLocation ? 'Updating' : 'Creating'} location in handlePutLocation`, { 
                data: { logData, locationExists: !!existingLocation } 
            });
            let locationRecord;
            if (!existingLocation) {
                // Create location if it doesn't exist - only include fields present in payload
                logger.debug(`🟡 [${reqId}] Building location create fields in handlePutLocation`, { data: logData });
                const locationCreateFields = LocationService.buildLocationCreateFields(payload, partnerCredentials.partner_id);
                locationRecord = await databaseService.prisma.location.create({
                    data: locationCreateFields,
                });
                logger.debug(`🟢 [${reqId}] Created new location in handlePutLocation`, { 
                    data: { logData, locationId: locationRecord.id } 
                });
            }
            else {
                // Build update fields - only include fields present in payload that have changed
                logger.debug(`🟡 [${reqId}] Building location update fields in handlePutLocation`, { data: logData });
                const locationUpdateFields = LocationService.buildLocationUpdateFields(payload, existingLocation);
                // Update existing location only if there are changes
                if (!isEmpty(locationUpdateFields)) {
                    locationRecord = await databaseService.prisma.location.update({
                        where: { id: existingLocation.id },
                        data: locationUpdateFields,
                    });
                    logger.debug(`🟢 [${reqId}] Updated existing location in handlePutLocation`, { 
                        data: { logData, locationId: locationRecord.id } 
                    });
                }
                else {
                    logger.debug(`🟡 [${reqId}] No changes detected, using existing location in handlePutLocation`, { data: logData });
                    locationRecord = existingLocation;
                }
            }

            // Get UBC party ID for beckn_connector_id generation
            const ubcPartyId = await this.getUbcPartyId(partnerCredentials.partner_id);

            // Handle EVSEs if provided
            logger.debug(`🟡 [${reqId}] Processing EVSEs in handlePutLocation`, { 
                data: { logData, evsesCount: payload.evses?.length || 0, ubcPartyId } 
            });
            if (payload.evses !== undefined && payload.evses.length > 0) {
            for (const evse of payload.evses) {
                const existingEvse = await databaseService.prisma.eVSE.findFirst({
                    where: {
                        location_id: locationRecord.id,
                        uid: evse.uid,
                        deleted: false,
                    },
                });

                if (existingEvse) {
                    // Build update fields - only include fields present in payload that have changed
                    const evseUpdateFields = LocationService.buildEVSEUpdateFields(evse, existingEvse);
                    // Only update if there are changes
                    if (!isEmpty(evseUpdateFields)) {
                        await databaseService.prisma.eVSE.update({
                            where: { id: existingEvse.id },
                            data: evseUpdateFields,
                        });
                    }
                }
                else {
                    // Create EVSE if it doesn't exist - only include fields present in payload
                    const evseCreateFields = LocationService.buildEVSECreateFields(evse, locationRecord.id, partnerCredentials.partner_id);
                    await databaseService.prisma.eVSE.create({
                        data: evseCreateFields,
                    });
                }

                // Handle connectors if provided
                if (evse.connectors !== undefined && evse.connectors.length > 0) {
                    const evseRecord = existingEvse || await databaseService.prisma.eVSE.findFirst({
                        where: {
                            location_id: locationRecord.id,
                            uid: evse.uid,
                            deleted: false,
                        },
                    });

                    if (evseRecord) {
                        for (const connector of evse.connectors) {
                            const connectorId = (connector as any).connector_id ?? connector.id;
                            const existingConnector = await databaseService.prisma.eVSEConnector.findFirst({
                                where: {
                                    evse_id: evseRecord.id,
                                    connector_id: connectorId,
                                    deleted: false,
                                },
                            });

                            if (existingConnector) {
                                // Build update fields - only include fields present in payload that have changed
                                const connectorUpdateFields = LocationService.buildConnectorUpdateFields(connector as OCPIConnector & { connector_id?: string }, existingConnector);
                                // Only update if there are changes
                                if (!isEmpty(connectorUpdateFields)) {
                                    await databaseService.prisma.eVSEConnector.update({
                                        where: { id: existingConnector.id },
                                        data: connectorUpdateFields,
                                    });
                                }
                            }
                            else {
                                // Create connector if it doesn't exist - only include fields present in payload
                                // Use external_object_id from location and EVSE for beckn_connector_id
                                const connectorCreateFields = LocationService.buildConnectorCreateFields(
                                    connector as OCPIConnector & { connector_id?: string },
                                    evseRecord.id,
                                    partnerCredentials.partner_id,
                                    locationRecord.external_object_id,
                                    evseRecord.external_object_id,
                                    ubcPartyId,
                                );
                                await databaseService.prisma.eVSEConnector.create({
                                    data: connectorCreateFields,
                                });
                            }
                        }
                    }
                }
            }
        }

            logger.debug(`🟡 [${reqId}] Fetching refreshed location with relations in handlePutLocation`, { data: logData });
            // Fetch updated location with relations
            const refreshedLocation = await databaseService.prisma.location.findUnique({
                where: { id: locationRecord.id },
                include: {
                    evses: {
                        include: {
                            evse_connectors: true,
                        },
                    },
                },
            });

            logger.debug(`🟡 [${reqId}] Mapping Prisma location to OCPI format in handlePutLocation`, { data: logData });
            const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(refreshedLocation as LocationWithRelations);
            const response = OCPIResponseService.success<OCPILocation>(ocpiLocation);

            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 200,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutLocationRes,
                location_id: locationRecord.id,
            });

            logger.debug(`🟢 [${reqId}] Returning PUT /locations/:location_id response in handlePutLocation`, { 
                data: { logData, httpStatus: response.httpStatus } 
            });

            return response;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in handlePutLocation: ${e?.toString()}`, e, { data: logData });
            throw e;
        }
    }

    public static async handlePutEVSE(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
        };

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutEVSEReq,
            ocpi_location_id: location_id,
            ocpi_evse_uid: evse_uid,
        });
        const payload = req.body as OCPIEVSE;

        if (!payload || payload.uid !== evse_uid) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutEVSERes,
            });
            return response;
        }

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutEVSERes,
            });
            return response;
        }

        const existingEvse = await databaseService.prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        let evseRecord;
        if (existingEvse) {
            // Build update fields - only include fields present in payload that have changed
            const evseUpdateFields = LocationService.buildEVSEUpdateFields(payload, existingEvse);
            // Only update if there are changes
            if (!isEmpty(evseUpdateFields)) {
                evseRecord = await databaseService.prisma.eVSE.update({
                    where: { id: existingEvse.id },
                    data: evseUpdateFields,
                });
            }
            else {
                evseRecord = existingEvse;
            }
        }
        else {
            // Create new EVSE - only include fields present in payload
            const evseCreateFields = LocationService.buildEVSECreateFields(payload, prismaLocation.id, partnerCredentials.partner_id);
            evseRecord = await databaseService.prisma.eVSE.create({
                data: evseCreateFields,
            });
        }

        // Handle connectors if provided
        if (payload.connectors !== undefined && payload.connectors.length > 0) {
            // Get UBC party ID for beckn_connector_id generation
            const ubcPartyId = await this.getUbcPartyId(partnerCredentials.partner_id);

            for (const connector of payload.connectors) {
                const connectorId = (connector as any).connector_id ?? connector.id;
                const existingConnector = await databaseService.prisma.eVSEConnector.findFirst({
                    where: {
                        evse_id: evseRecord.id,
                        connector_id: connectorId,
                        deleted: false,
                    },
                });

                if (existingConnector) {
                    // Build update fields - only include fields present in payload that have changed
                    const connectorUpdateFields = LocationService.buildConnectorUpdateFields(connector as OCPIConnector & { connector_id?: string }, existingConnector);
                    // Only update if there are changes
                    if (!isEmpty(connectorUpdateFields)) {
                        await databaseService.prisma.eVSEConnector.update({
                            where: { id: existingConnector.id },
                            data: connectorUpdateFields,
                        });
                    }
                }
                else {
                    // Create connector if it doesn't exist - only include fields present in payload
                    // Use external_object_id from location and EVSE for beckn_connector_id
                    const connectorCreateFields = LocationService.buildConnectorCreateFields(
                        connector as OCPIConnector & { connector_id?: string },
                        evseRecord.id,
                        partnerCredentials.partner_id,
                        prismaLocation.external_object_id,
                        evseRecord.external_object_id,
                        ubcPartyId,
                    );
                    await databaseService.prisma.eVSEConnector.create({
                        data: connectorCreateFields,
                    });
                }
            }
        }

        // Fetch updated EVSE
        const refreshedEvse = await LocationDbService.findEVSEByLocationAndUid(
            location_id,
            evse_uid,
            partnerCredentials.partner_id,
        );
        if (!refreshedEvse) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutEVSERes,
            });
            return response;
        }

        const ocpiEvse = LocationDbService.mapPrismaEVSEToOcpi(refreshedEvse);
        const response = OCPIResponseService.success<OCPIEVSE>(ocpiEvse);

        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutEVSERes,
            location_id: prismaLocation.id,
            evse_id: evseRecord.id,
        });

        return response;
    }

    public static async handlePutConnector(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutConnectorReq,
            ocpi_location_id: location_id,
            ocpi_evse_uid: evse_uid,
            ocpi_connector_id: connector_id,
        });
        const payload = req.body as OCPIConnector & { connector_id?: string };

        const payloadConnectorId = (payload as any).connector_id ?? payload.id;
        if (!payload || payloadConnectorId !== connector_id) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutConnectorRes,
            });
            return response;
        }

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutConnectorRes,
            });
            return response;
        }

        const evseRecord = await databaseService.prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        if (!evseRecord) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutConnectorRes,
                location_id: prismaLocation.id,
            });
            return response;
        }

        const existingConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: {
                evse_id: evseRecord.id,
                connector_id,
                deleted: false,
            },
        });

        if (existingConnector) {
            // Build update fields - only include fields present in payload that have changed
            const connectorUpdateFields = LocationService.buildConnectorUpdateFields(payload, existingConnector);
            // Only update if there are changes
            if (!isEmpty(connectorUpdateFields)) {
                await databaseService.prisma.eVSEConnector.update({
                    where: { id: existingConnector.id },
                    data: connectorUpdateFields,
                });
            }
        }
        else {
            // Get UBC party ID for beckn_connector_id generation
            const ubcPartyId = await this.getUbcPartyId(partnerCredentials.partner_id);

            // Create connector if it doesn't exist - only include fields present in payload
            // Use external_object_id from location and EVSE for beckn_connector_id
            const connectorCreateFields = LocationService.buildConnectorCreateFields(
                payload,
                evseRecord.id,
                partnerCredentials.partner_id,
                prismaLocation.external_object_id,
                evseRecord.external_object_id,
                ubcPartyId,
            );
            await databaseService.prisma.eVSEConnector.create({
                data: connectorCreateFields,
            });
        }

        const refreshedConnector = await LocationDbService.findConnectorByLocationEvseAndConnectorId(
            location_id,
            evse_uid,
            connector_id,
        );
        if (!refreshedConnector) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PutConnectorRes,
                location_id: prismaLocation.id,
                evse_id: evseRecord.id,
            });
            return response;
        }

        const ocpiConnector = LocationDbService.mapPrismaConnectorToOcpi(refreshedConnector);
        const response = OCPIResponseService.success<OCPIConnector>(ocpiConnector);

        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutConnectorRes,
            location_id: prismaLocation.id,
            evse_id: evseRecord.id,
            connector_id: refreshedConnector.id,
        });

        return response;
    }

    // patch requests

    public static async handlePatchLocation(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id } = req.params;

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchLocationReq,
            ocpi_location_id: location_id,
        });

        type PatchConnectorWithId = OCPIPatchConnector & { id?: string };
        type PatchEVSEWithUid = OCPIPatchEVSE & { uid?: string; connectors?: PatchConnectorWithId[] };
        type LocationPatchWithNested = OCPIPatchLocation & { evses?: PatchEVSEWithUid[] };

        const patch = req.body as LocationPatchWithNested;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            const response = OCPIResponseService.clientError<OCPILocation | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchLocationRes,
            });
            return response;
        }

        // Split top-level fields and nested EVSE patches
        const { evses: patchEvses, ...topLevelPatch } = patch;

        // Build update fields - only include fields present in payload that have changed
        const locationUpdateFields = LocationService.buildLocationUpdateFields(topLevelPatch as OCPILocation, prismaLocation);

        // Update location only if there are changes
        if (!isEmpty(locationUpdateFields)) {
            await databaseService.prisma.location.update({
                where: { id: prismaLocation.id },
                data: locationUpdateFields,
            });
        }

        // Handle nested EVSE patches if provided
        if (patchEvses !== undefined && patchEvses.length > 0) {
            for (const evsePatch of patchEvses) {
                if (!evsePatch.uid) {
                    continue;
                }

                const existingEvse = await databaseService.prisma.eVSE.findFirst({
                    where: {
                        location_id: prismaLocation.id,
                        uid: evsePatch.uid,
                        deleted: false,
                    },
                });

                if (!existingEvse) {
                    continue;
                }

                // Build EVSE update fields - only include fields present in payload that have changed
                const evseUpdateFields = LocationService.buildEVSEUpdateFields(evsePatch as OCPIEVSE, existingEvse);

                // Update EVSE only if there are changes
                if (!isEmpty(evseUpdateFields)) {
                    await databaseService.prisma.eVSE.update({
                        where: { id: existingEvse.id },
                        data: evseUpdateFields,
                    });
                }

                // Handle nested connector patches if provided
                if (evsePatch.connectors !== undefined && evsePatch.connectors.length > 0) {
                    for (const connectorPatch of evsePatch.connectors) {
                        const connectorId = (connectorPatch as any).connector_id ?? (connectorPatch as any).id;
                        if (!connectorId) {
                            continue;
                        }

                        const existingConnector = await databaseService.prisma.eVSEConnector.findFirst({
                            where: {
                                evse_id: existingEvse.id,
                                connector_id: connectorId,
                                deleted: false,
                            },
                        });

                        if (!existingConnector) {
                            continue;
                        }

                        // Build connector update fields - only include fields present in payload that have changed
                        const connectorUpdateFields = LocationService.buildConnectorUpdateFields(connectorPatch as OCPIConnector & { connector_id?: string }, existingConnector);

                        // Update connector only if there are changes
                        if (!isEmpty(connectorUpdateFields)) {
                            await databaseService.prisma.eVSEConnector.update({
                                where: { id: existingConnector.id },
                                data: connectorUpdateFields,
                            });
                        }
                    }
                }
            }
        }

        // Fetch updated location
        const stored = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!stored) {
            const response = OCPIResponseService.clientError<OCPILocation | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchLocationRes,
            });
            return response;
        }
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(stored);

        const response = OCPIResponseService.success<OCPILocation>(ocpiLocation);

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchLocationRes,
            location_id: prismaLocation.id,
        });

        return response;
    }

    public static async handlePatchEVSE(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as { location_id: string; evse_uid: string };

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchEVSEReq,
            ocpi_location_id: location_id,
            ocpi_evse_uid: evse_uid,
        });
        const patch = req.body as OCPIPatchEVSE;

        // Find location (to resolve internal location_id) scoped to partner
        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchEVSERes,
            });
            return response;
        }

        const prisma = databaseService.prisma;

        // Find the concrete EVSE row; we will update it in-place instead of
        // deleting/recreating, so its primary key remains stable.
        const evseRecord = await prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        if (!evseRecord) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchEVSERes,
            });
            return response;
        }

        // Build update fields - only include fields present in payload that have changed
        const evseUpdateFields = LocationService.buildEVSEUpdateFields(patch as OCPIEVSE, evseRecord);

        // Only update if there are changes
        if (!isEmpty(evseUpdateFields)) {
            await prisma.eVSE.update({
                where: { id: evseRecord.id },
                data: evseUpdateFields,
            });
        }

        // Re-read location + relations and map back to OCPI
        const refreshedLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!refreshedLocation) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchEVSERes,
            });
            return response;
        }

        const refreshedEvse = refreshedLocation.evses.find((e) => e.uid === evse_uid);
        if (!refreshedEvse) {
            const response = OCPIResponseService.clientError<OCPIEVSE | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchEVSERes,
            });
            return response;
        }

        const ocpiEvse = LocationDbService.mapPrismaEVSEToOcpi(refreshedEvse);
        const response = OCPIResponseService.success<OCPIEVSE>(ocpiEvse);

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchEVSERes,
            location_id: prismaLocation.id,
            evse_id: evseRecord.id,
        });

        return response;
    }

    public static async handlePatchConnector(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };

        // Log incoming request (non-blocking)
        // Pass OCPI IDs from params - logging function will resolve them to internal DB IDs
        OCPIRequestLogService.logIncomingRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchConnectorReq,
            ocpi_location_id: location_id,
            ocpi_evse_uid: evse_uid,
            ocpi_connector_id: connector_id,
        });
        const patch = req.body as OCPIPatchConnector;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );

        if (!prismaLocation) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchConnectorRes,
            });
            return response;
        }

        // Find the EVSE
        const evseRecord = await databaseService.prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        if (!evseRecord) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchConnectorRes,
            });
            return response;
        }

        // Find the connector
        const existingConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: {
                evse_id: evseRecord.id,
                connector_id,
                deleted: false,
            },
        });

        if (!existingConnector) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchConnectorRes,
            });
            return response;
        }

        // Build update fields - only include fields present in payload that have changed
        const connectorUpdateFields = LocationService.buildConnectorUpdateFields(patch as OCPIConnector & { connector_id?: string }, existingConnector);

        // Only update if there are changes
        if (!isEmpty(connectorUpdateFields)) {
            await databaseService.prisma.eVSEConnector.update({
                where: { id: existingConnector.id },
                data: connectorUpdateFields,
            });
        }

        const stored = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!stored) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 404,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchConnectorRes,
            });
            return response;
        }

        const refreshedConnector = await LocationDbService.findConnectorByLocationEvseAndConnectorId(
            location_id,
            evse_uid,
            connector_id,
        );
        if (!refreshedConnector) {
            const response = OCPIResponseService.clientError<OCPIConnector | null>(null);
            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logIncomingResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus ?? 400,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchConnectorRes,
            });
            return response;
        }

        const ocpiConnector = LocationDbService.mapPrismaConnectorToOcpi(refreshedConnector);
        const response = OCPIResponseService.success<OCPIConnector>(ocpiConnector);

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logIncomingResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus ?? 200,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchConnectorRes,
            location_id: prismaLocation.id,
            evse_id: evseRecord.id,
            connector_id: existingConnector.id,
        });

        return response;
    }

}