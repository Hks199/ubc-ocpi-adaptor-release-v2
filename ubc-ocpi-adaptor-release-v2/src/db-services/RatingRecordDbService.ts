import { Prisma, RatingRecord } from "@prisma/client";
import { databaseService } from "../services/database.service";

export default class RatingRecordDbService {
    public static async create(data: Prisma.RatingRecordCreateArgs): Promise<RatingRecord> {
        return databaseService.prisma.ratingRecord.create(data);
    }

    public static async update(id: string, data: Prisma.RatingRecordUncheckedUpdateInput): Promise<RatingRecord> {
        return databaseService.prisma.ratingRecord.update({
            where: { id },
            data,
        });
    }

    public static async getById(id: string): Promise<RatingRecord | null> {
        return databaseService.prisma.ratingRecord.findUnique({
            where: { id },
        });
    }
}
