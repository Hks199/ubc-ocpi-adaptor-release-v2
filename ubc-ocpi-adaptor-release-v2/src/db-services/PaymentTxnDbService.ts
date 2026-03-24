
import { PaymentTxn, Prisma } from "@prisma/client";
import { databaseService } from "../services/database.service";

export default class PaymentTxnDbService {
    public static async create(data: Prisma.PaymentTxnCreateArgs): Promise<PaymentTxn> {
        const paymentTxn = await databaseService.prisma.paymentTxn.create(data);
        return paymentTxn;
    }

    public static async update(id: string, data: Prisma.PaymentTxnUncheckedUpdateInput): Promise<PaymentTxn> {
        const item = await databaseService.prisma.paymentTxn.update({
            where: { id },
            data,
        });
        return item;
    }

    public static async getByFilters(
        queryArgs: Prisma.PaymentTxnFindManyArgs,
        page: number = 0,
        perPage: number = 20,
        getCountOnly: boolean = false,
        includeCount: boolean = false,
    ): Promise<{
        records?: Array<PaymentTxn>,
        total_count?: number | null,
        has_next?: boolean,
        has_previous?: boolean,
    }> {
        const countFilters: Prisma.PaymentTxnCountArgs = {
            where: queryArgs.where,
        };

        // Get count
        let count = null;
        if (getCountOnly || includeCount) {
            count = await databaseService.prisma.paymentTxn.count(countFilters);

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

        const records = await databaseService.prisma.paymentTxn.findMany(queryArgs);

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

    public static async getFirstByFilter(queryArgs: Prisma.PaymentTxnFindFirstArgs): Promise<PaymentTxn | null> {
        const paymentTxn = await databaseService.prisma.paymentTxn.findFirst(queryArgs);
        return paymentTxn;
    }

    public static async getByOrderId(orderId: string): Promise<PaymentTxn | null> {
        // Note: Run `npx prisma generate` after schema update to get proper types
        // payment_gateway_order_id field is in schema but types may not be generated yet
        const paymentTxn = await databaseService.prisma.paymentTxn.findFirst({
            where: {
                payment_gateway_order_id: orderId,
            },
        });
        return paymentTxn;
    }

    public static async getById(id: string): Promise<PaymentTxn | null> {
        const paymentTxn = await databaseService.prisma.paymentTxn.findUnique({
            where: { id },
        });
        return paymentTxn;
    }

    public static async getByAuthorizationReference(authorization_reference: string): Promise<PaymentTxn | null> {
        return databaseService.prisma.paymentTxn.findFirst({
            where: { authorization_reference: authorization_reference },
            orderBy: {
                created_at: 'desc',
            },
        });
    }
}
