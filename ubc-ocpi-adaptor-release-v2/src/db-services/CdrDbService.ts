import { CDR, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';


export class CdrDbService {
    // ==================== Basic Getters ====================

    public static async getById(
        id: string,
        args: Omit<Prisma.CDRFindUniqueArgs, 'where'> = {},
    ): Promise<CDR | null> {
        const record = await databaseService.prisma.cDR.findUnique({
            where: { id },
            ...args,
        });

        return record as CDR | null;
    }

    public static async findFirstByFilters(
        where: Prisma.CDRWhereInput,
        args: Omit<Prisma.CDRFindFirstArgs, 'where'> = {},
    ): Promise<CDR | null> {
        const record = await databaseService.prisma.cDR.findFirst({
            where,
            ...args,
        });

        return record as CDR | null;
    }

    // ==================== List / Pagination Helpers ====================

    public static async getByFilters(
        queryArgs: Prisma.CDRFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false,
    ): Promise<{
        records?: CDR[];
        total_count?: number;
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        const countArgs: Prisma.CDRCountArgs = {
            where: queryArgs.where,
        };

        const total = await databaseService.prisma.cDR.count(countArgs);

        if (getCount) {
            return { total_count: total };
        }

        let hasPrevious = page > 0 && total > 0;
        let hasNext = false;

        if (perPage > 0) {
            const skip = page * perPage;
            const take = perPage;
            queryArgs.skip = skip;
            queryArgs.take = take;
            hasNext = (page + 1) * perPage < total;
        }

        const records = await databaseService.prisma.cDR.findMany(queryArgs);

        return {
            records: records as CDR[],
            total_count: total,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.CDRFindManyArgs,
        page: number = 0,
        perPage: number = 0,
    ): Promise<{
        records?: CDR[];
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        let hasPrevious = page > 0;
        let hasNext = false;

        if (perPage > 0) {
            const skip = page * perPage;
            const take = perPage;
            queryArgs.skip = skip;
            queryArgs.take = take;
        }

        const records = await databaseService.prisma.cDR.findMany(queryArgs);

        if (perPage > 0 && records.length > 0 && records.length >= perPage) {
            hasNext = true;
        }

        return {
            records: records as CDR[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    // ==================== Mutations ====================

    public static async create(
        data: Prisma.CDRCreateArgs,
    ): Promise<CDR> {
        return databaseService.prisma.cDR.create(data);
    }

    public static async update(
        id: string,
        updateFields: Prisma.CDRUpdateInput,
    ): Promise<CDR> {
        return databaseService.prisma.cDR.update({
            where: { id },
            data: updateFields,
        });
    }

    public static async delete(id: string): Promise<CDR> {
        return databaseService.prisma.cDR.delete({
            where: { id },
        });
    }

    public static async getByAuthorizationReference(authorization_reference: string): Promise<CDR | null> {
        return databaseService.prisma.cDR.findFirst({
            where: { authorization_reference: authorization_reference, deleted: false },
        });
    }
}


