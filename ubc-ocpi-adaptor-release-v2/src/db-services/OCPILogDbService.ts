import { OCPILog, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';

export type OCPILogWithRelations = OCPILog;

export class OCPILogDbService {
    // Basic create helper – main entry point for logging
    public static async createLog(
        data: Prisma.OCPILogCreateInput,
    ): Promise<OCPILogWithRelations> {
        return databaseService.prisma.oCPILog.create({ data }) as Promise<OCPILogWithRelations>;
    }

    // Optional: basic getters if needed later
    public static async getById(
        id: string,
        args: Omit<Prisma.OCPILogFindUniqueArgs, 'where'> = {},
    ): Promise<OCPILogWithRelations | null> {
        const record = await databaseService.prisma.oCPILog.findUnique({
            where: { id },
            ...args,
        });
        return record as OCPILogWithRelations | null;
    }
}


