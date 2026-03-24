import { OCPIPartnerCredentials, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';

export type OCPIPartnerCredentialsWithRelations = OCPIPartnerCredentials;

export class OCPIPartnerCredentialsDbService {
    // ==================== Basic Getters ====================

    public static async getById(
        id: string,
        args: Omit<Prisma.OCPIPartnerCredentialsFindUniqueArgs, 'where'> = {},
    ): Promise<OCPIPartnerCredentialsWithRelations | null> {
        const record = await databaseService.prisma.oCPIPartnerCredentials.findUnique({
            where: { id },
            ...args,
        });

        return record as OCPIPartnerCredentialsWithRelations | null;
    }

    public static async findFirstByFilters(
        where: Prisma.OCPIPartnerCredentialsWhereInput,
        args: Omit<Prisma.OCPIPartnerCredentialsFindFirstArgs, 'where'> = {},
    ): Promise<OCPIPartnerCredentialsWithRelations | null> {
        const record = await databaseService.prisma.oCPIPartnerCredentials.findFirst({
            where,
            ...args,
        });

        return record as OCPIPartnerCredentialsWithRelations | null;
    }

    // ==================== List / Pagination Helpers ====================

    public static async getByFilters(
        queryArgs: Prisma.OCPIPartnerCredentialsFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false,
    ): Promise<{
        records?: OCPIPartnerCredentialsWithRelations[];
        total_count?: number;
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        const countArgs: Prisma.OCPIPartnerCredentialsCountArgs = {
            where: queryArgs.where,
        };

        const total = await databaseService.prisma.oCPIPartnerCredentials.count(countArgs);

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

        const records = await databaseService.prisma.oCPIPartnerCredentials.findMany(queryArgs);

        return {
            records: records as OCPIPartnerCredentialsWithRelations[],
            total_count: total,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.OCPIPartnerCredentialsFindManyArgs,
        page: number = 0,
        perPage: number = 0,
    ): Promise<{
        records?: OCPIPartnerCredentialsWithRelations[];
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

        const records = await databaseService.prisma.oCPIPartnerCredentials.findMany(queryArgs);

        if (perPage > 0 && records.length > 0 && records.length >= perPage) {
            hasNext = true;
        }

        return {
            records: records as OCPIPartnerCredentialsWithRelations[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    // ==================== Mutations ====================

    public static async createCredentials(
        data: Prisma.OCPIPartnerCredentialsCreateArgs,
    ): Promise<OCPIPartnerCredentials> {
        return databaseService.prisma.oCPIPartnerCredentials.create(data);
    }

    public static async updateCredentials(
        id: string,
        updateFields: Prisma.OCPIPartnerCredentialsUpdateInput,
    ): Promise<OCPIPartnerCredentials> {
        return databaseService.prisma.oCPIPartnerCredentials.update({
            where: { id },
            data: updateFields,
        });
    }

    public static async deleteCredentials(id: string): Promise<OCPIPartnerCredentials> {
        return databaseService.prisma.oCPIPartnerCredentials.delete({
            where: { id },
        });
    }

    public static getByPartnerId(partnerId: string): Promise<OCPIPartnerCredentials | null> {
        return databaseService.prisma.oCPIPartnerCredentials.findUnique({
            where: { partner_id: partnerId },
        });
    }
}


