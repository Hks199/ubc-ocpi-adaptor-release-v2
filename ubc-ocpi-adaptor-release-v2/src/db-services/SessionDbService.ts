import { Prisma, Session } from '@prisma/client';
import { databaseService } from '../services/database.service';


export class SessionDbService {
    // ==================== Basic Getters ====================

    public static async getById(
        id: string,
        args: Omit<Prisma.OCPIPartnerEndpointFindUniqueArgs, 'where'> = {},
    ): Promise<Session | null> {
        const record = await databaseService.prisma.session.findUnique({
            where: { id },
            ...args,
        });

        return record as Session | null;
    }

    public static async findFirstByFilters(
        where: Prisma.SessionWhereInput,
        args: Omit<Prisma.SessionFindFirstArgs, 'where'> = {},
    ): Promise<Session | null> {
        const record = await databaseService.prisma.session.findFirst({
            where,
            ...args,
        });

        return record as Session | null;
    }

    // ==================== List / Pagination Helpers ====================

    public static async getByFilters(
        queryArgs: Prisma.SessionFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false,
    ): Promise<{
        records?: Session[];
        total_count?: number;
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        const countArgs: Prisma.SessionCountArgs = {
            where: queryArgs.where,
        };

        const total = await databaseService.prisma.session.count(countArgs);

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

        const records = await databaseService.prisma.session.findMany(queryArgs);

        return {
            records: records as Session[],
            total_count: total,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.SessionFindManyArgs,
        page: number = 0,
        perPage: number = 0,
    ): Promise<{
        records?: Session[];
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

        const records = await databaseService.prisma.session.findMany(queryArgs);

        if (perPage > 0 && records.length > 0 && records.length >= perPage) {
            hasNext = true;
        }

        return {
            records: records as Session[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    // ==================== Mutations ====================

    public static async create(
        data: Prisma.SessionCreateArgs,
    ): Promise<Session> {
        return databaseService.prisma.session.create(data);
    }

    public static async update(
        id: string,
        updateFields: Prisma.SessionUpdateInput,
    ): Promise<Session> {
        return databaseService.prisma.session.update({
            where: { id },
            data: updateFields,
        });
    }

    public static async delete(id: string): Promise<Session> {
        return databaseService.prisma.session.delete({
            where: { id },
        });
    }

    public static async getByAuthorizationReference(authorization_reference: string): Promise<Session | null> {
        return databaseService.prisma.session.findUnique({
            where: { authorization_reference: authorization_reference },
        });
    }

    public static async getByCpoSessionId(session_id: string): Promise<Session | null> {
        return databaseService.prisma.session.findFirst({
            where: { cpo_session_id: session_id, deleted: false },
        });
    }
}


