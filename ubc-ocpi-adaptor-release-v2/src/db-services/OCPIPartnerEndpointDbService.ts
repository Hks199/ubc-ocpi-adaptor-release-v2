import { OCPIPartnerEndpoint, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';

export type OCPIPartnerEndpointWithRelations = OCPIPartnerEndpoint;

export class OCPIPartnerEndpointDbService {
    // ==================== Basic Getters ====================

    public static async getById(
        id: string,
        args: Omit<Prisma.OCPIPartnerEndpointFindUniqueArgs, 'where'> = {},
    ): Promise<OCPIPartnerEndpointWithRelations | null> {
        const record = await databaseService.prisma.oCPIPartnerEndpoint.findUnique({
            where: { id },
            ...args,
        });

        return record as OCPIPartnerEndpointWithRelations | null;
    }

    public static async findFirstByFilters(
        where: Prisma.OCPIPartnerEndpointWhereInput,
        args: Omit<Prisma.OCPIPartnerEndpointFindFirstArgs, 'where'> = {},
    ): Promise<OCPIPartnerEndpointWithRelations | null> {
        const record = await databaseService.prisma.oCPIPartnerEndpoint.findFirst({
            where,
            ...args,
        });

        return record as OCPIPartnerEndpointWithRelations | null;
    }

    // ==================== List / Pagination Helpers ====================

    public static async getByFilters(
        queryArgs: Prisma.OCPIPartnerEndpointFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false,
    ): Promise<{
        records?: OCPIPartnerEndpointWithRelations[];
        total_count?: number;
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        const countArgs: Prisma.OCPIPartnerEndpointCountArgs = {
            where: queryArgs.where,
        };

        const total = await databaseService.prisma.oCPIPartnerEndpoint.count(countArgs);

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

        const records = await databaseService.prisma.oCPIPartnerEndpoint.findMany(queryArgs);

        return {
            records: records as OCPIPartnerEndpointWithRelations[],
            total_count: total,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.OCPIPartnerEndpointFindManyArgs,
        page: number = 0,
        perPage: number = 0,
    ): Promise<{
        records?: OCPIPartnerEndpointWithRelations[];
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

        const records = await databaseService.prisma.oCPIPartnerEndpoint.findMany(queryArgs);

        if (perPage > 0 && records.length > 0 && records.length >= perPage) {
            hasNext = true;
        }

        return {
            records: records as OCPIPartnerEndpointWithRelations[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    // ==================== Mutations ====================

    public static async createEndpoint(
        data: Prisma.OCPIPartnerEndpointCreateArgs,
    ): Promise<OCPIPartnerEndpoint> {
        return databaseService.prisma.oCPIPartnerEndpoint.create(data);
    }

    public static async updateEndpoint(
        id: string,
        updateFields: Prisma.OCPIPartnerEndpointUpdateInput,
    ): Promise<OCPIPartnerEndpoint> {
        return databaseService.prisma.oCPIPartnerEndpoint.update({
            where: { id },
            data: updateFields,
        });
    }

    public static async deleteEndpoint(id: string): Promise<OCPIPartnerEndpoint> {
        return databaseService.prisma.oCPIPartnerEndpoint.delete({
            where: { id },
        });
    }

    public static async createMultipleEndpoints(data: Prisma.OCPIPartnerEndpointCreateManyArgs): Promise<number> {
        const result = await databaseService.prisma.oCPIPartnerEndpoint.createMany(data);
        return result.count;
    }
}


