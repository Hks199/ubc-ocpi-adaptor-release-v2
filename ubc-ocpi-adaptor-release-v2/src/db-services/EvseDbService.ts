import { Prisma, EVSEConnector, EVSE } from '@prisma/client';
import { databaseService } from '../services/database.service';


export class EvseDbService {
    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.EVSEFindManyArgs,
        page: number = 0,
        perPage: number = 0
    ): Promise<{
        records?: (EVSE & { evse_connectors?: EVSEConnector[] })[],
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

        const evses = await databaseService.prisma.eVSE.findMany(queryArgs);

        // Check if there's a next page
        let hasNext = false;
        if (perPage > 0 && evses.length > 0 && evses.length <= perPage) {
            hasNext = true;
        }

        return {
            records: evses,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getById(
        evseId: string,
        args: Prisma.EVSEFindFirstArgs = {}
    ): Promise<EVSE | null> {
        const evse = await databaseService.prisma.eVSE.findFirst({
            where: { id: evseId, deleted: false },
            ...args,
        });

        return evse as EVSE | null;
    }

    public static async getByEvseId(
        evseId: string,
        args: Prisma.EVSEFindFirstArgs = {}
    ): Promise<EVSE & { evse_connectors?: EVSEConnector[] } | null> {
        const evse = await databaseService.prisma.eVSE.findFirst({
            where: {
                evse_id: evseId,
                deleted: false,
            },
            ...args,
        });

        return evse;
    }

    public static async getByEvseUId(
        evseUid: string,
        args: Prisma.EVSEFindFirstArgs = {}
    ): Promise<EVSE & { evse_connectors?: EVSEConnector[] } | null> {
        const evse = await databaseService.prisma.eVSE.findFirst({
            where: {
                uid: evseUid,
                deleted: false,
            },
            ...args,
        });

        return evse;
    }

}