
import { OCPIPartner, Prisma } from "@prisma/client";
import { databaseService } from "../services/database.service";

export default class OCPIPartnerDbService {
    public static async create(data: Prisma.OCPIPartnerCreateArgs): Promise<OCPIPartner> {
        const ocpiPartner = await databaseService.prisma.oCPIPartner.create(data);
        return ocpiPartner;
    }

    public static async update(id: string, data: Prisma.OCPIPartnerUncheckedUpdateInput): Promise<OCPIPartner> {
        const ocpiPartner = await databaseService.prisma.oCPIPartner.update({
            where: { id },
            data,
        });
        return ocpiPartner;
    }
    public static async getById(id: string): Promise<OCPIPartner | null> {
        const ocpiPartner = await databaseService.prisma.oCPIPartner.findUnique({
            where: { id },
        });
        return ocpiPartner;
    }
        
    public static async getByFilters(
        queryArgs: Prisma.OCPIPartnerFindManyArgs,
        page: number = 0,
        perPage: number = 20,
        getCountOnly: boolean = false,
        includeCount: boolean = false,
    ): Promise<{
        records?: Array<OCPIPartner>,
        total_count?: number | null,
        has_next?: boolean,
        has_previous?: boolean,
    }> {
        const countFilters: Prisma.OCPIPartnerCountArgs = {
            where: queryArgs.where,
        };

        // Get count
        let count = null;
        if (getCountOnly || includeCount) {
            count = await databaseService.prisma.oCPIPartner.count(countFilters);

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

        const records = await databaseService.prisma.oCPIPartner.findMany(queryArgs);

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

    public static async getFirstByFilter(queryArgs: Prisma.OCPIPartnerFindFirstArgs): Promise<OCPIPartner | null> {
        const ocpiPartner = await databaseService.prisma.oCPIPartner.findFirst(queryArgs);
        return ocpiPartner;
    }
}
