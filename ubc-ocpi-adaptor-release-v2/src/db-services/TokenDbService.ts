import { Prisma, Token } from '@prisma/client';
import { databaseService } from '../services/database.service';

export type TokenWithRelations = Token;

export class TokenDbService {
    // ==================== Basic Getters ====================

    public static async getById(
        id: string,
        args: Omit<Prisma.TokenFindUniqueArgs, 'where'> = {},
    ): Promise<TokenWithRelations | null> {
        const record = await databaseService.prisma.token.findUnique({
            where: { id },
            ...args,
        });

        return record as TokenWithRelations | null;
    }

    public static async findFirstByFilters(
        where: Prisma.TokenWhereInput,
        args: Omit<Prisma.TokenFindFirstArgs, 'where'> = {},
    ): Promise<TokenWithRelations | null> {
        const record = await databaseService.prisma.token.findFirst({
            where,
            ...args,
        });

        return record as TokenWithRelations | null;
    }

    // ==================== List / Pagination Helpers ====================

    public static async getByFilters(
        queryArgs: Prisma.TokenFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false,
    ): Promise<{
        records?: TokenWithRelations[];
        total_count?: number;
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        const countArgs: Prisma.TokenCountArgs = {
            where: queryArgs.where,
        };

        const total = await databaseService.prisma.token.count(countArgs);

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

        const records = await databaseService.prisma.token.findMany(queryArgs);

        return {
            records: records as TokenWithRelations[],
            total_count: total,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.TokenFindManyArgs,
        page: number = 0,
        perPage: number = 0,
    ): Promise<{
        records?: TokenWithRelations[];
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

        const records = await databaseService.prisma.token.findMany(queryArgs);

        if (perPage > 0 && records.length > 0 && records.length >= perPage) {
            hasNext = true;
        }

        return {
            records: records as TokenWithRelations[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    // ==================== Mutations ====================

    public static async createToken(
        data: Prisma.TokenCreateArgs,
    ): Promise<Token> {
        return databaseService.prisma.token.create(data);
    }

    public static async updateToken(
        id: string,
        updateFields: Prisma.TokenUpdateInput,
    ): Promise<Token> {
        return databaseService.prisma.token.update({
            where: { id },
            data: updateFields,
        });
    }

    public static async deleteToken(id: string): Promise<Token> {
        return databaseService.prisma.token.delete({
            where: { id },
        });
    }
}


