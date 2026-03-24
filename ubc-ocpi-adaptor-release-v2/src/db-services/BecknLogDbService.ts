
import { BecknLog, Prisma } from "@prisma/client";
import { databaseService } from "../services/database.service";

export default class BecknLogDbService {
    public static async create(data: Prisma.BecknLogCreateArgs): Promise<BecknLog> {
        const becknLog = await databaseService.prisma.becknLog.create(data);
        return becknLog;
    }

    public static async update(id: string, data: Prisma.BecknLogUpdateArgs): Promise<BecknLog> {
        const item = await databaseService.prisma.becknLog.update({
            where: { id },
            data,
        });
        return item;
    }

    public static async getByFilters(
        queryArgs: Prisma.BecknLogFindManyArgs,
        page: number = 0,
        perPage: number = 20,
        getCountOnly: boolean = false,
        includeCount: boolean = false,
    ): Promise<{
        records?: Array<BecknLog>,
        total_count?: number | null,
        has_next?: boolean,
        has_previous?: boolean,
    }> {
        const countFilters: Prisma.BecknLogCountArgs = {
            where: queryArgs.where,
        };

        // Get count
        let count = null;
        if (getCountOnly || includeCount) {
            count = await databaseService.prisma.becknLog.count(countFilters);

            if (getCountOnly) {
                return {
                    total_count: count,
                };
            }
        }

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

        const records = await databaseService.prisma.becknLog.findMany(queryArgs);

        // Check if there's a next page
        let hasNext = false;
        if (perPage > 0 && records.length > 0 && records.length === perPage) {
            hasNext = true;
        }

        return {
            records: records,
            total_count: count,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getFirstByFilter(queryArgs: Prisma.BecknLogFindFirstArgs): Promise<BecknLog | null> {
        const becknLog = await databaseService.prisma.becknLog.findFirst(queryArgs);
        return becknLog;
    }
}
