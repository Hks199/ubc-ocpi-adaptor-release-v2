import { Tariff, Prisma, EVSEConnector, EVSE, Location } from '@prisma/client';
import { databaseService } from '../services/database.service';


export class EvseConnectorDbService {
    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.EVSEConnectorFindManyArgs,
        page: number = 0,
        perPage: number = 0
    ): Promise<{
        records?: (EVSEConnector & { tariff?: Tariff[] })[],
        has_next?: boolean,
        has_previous?: boolean,
    }> {
        // Check if there's a previous page
        let hasPrevious = true;
        if (page === 0) {
            hasPrevious = false;
        }

        if (perPage !== 0) {
            const skip = page * perPage;
            const take = perPage;

            queryArgs.skip = skip;
            queryArgs.take = take;
        }

        const evseConnectors = await databaseService.prisma.eVSEConnector.findMany(queryArgs);

        // Check if there's a next page
        let hasNext = false;
        if (perPage > 0 && evseConnectors.length > 0 && evseConnectors.length <= perPage) {
            hasNext = true;
        }

        return {
            records: evseConnectors,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getById(
        evseConnectorId: string,
        args: Prisma.EVSEConnectorFindFirstArgs = {}
    ): Promise<(EVSEConnector & { evse?: EVSE & { location?: Location } }) | null> {
        const evseConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: { id: evseConnectorId, deleted: false },
            ...args,
        });

        return evseConnector as EVSEConnector | null;
    }

    public static async getByConnectorId(
        connectorId: string,
        args: Prisma.EVSEConnectorFindFirstArgs = {}
    ): Promise<(EVSEConnector & { evse?: EVSE & { location?: Location } }) | null> {
        const evseConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: {
                connector_id: connectorId,
                deleted: false,
            },
            ...args,
        });

        return evseConnector;
    }

    public static async getByBecknConnectorId(
        becknConnectorId: string,
        args: Prisma.EVSEConnectorFindFirstArgs = {}
    ): Promise<(EVSEConnector & { evse?: EVSE & { location?: Location } }) | null> {
        const evseConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: { beckn_connector_id: becknConnectorId, deleted: false },
            ...args,
        });
        return evseConnector;
    }

    public static async updateUBCCatalogId(evseConnectorId: string, ubcCatalogId: string): Promise<EVSEConnector> {
        const evseConnector = await databaseService.prisma.eVSEConnector.update({
            where: { id: evseConnectorId },
            data: { ubc_catalog_id: ubcCatalogId },
        }) as EVSEConnector;
        return evseConnector;
    }

    public static async updateEVSEConnector(evseConnectorId: string, data: Prisma.EVSEConnectorUpdateInput): Promise<EVSEConnector> {
        const evseConnector = await databaseService.prisma.eVSEConnector.update({
            where: { id: evseConnectorId },
            data,
        }) as EVSEConnector;
        return evseConnector;
    }

}