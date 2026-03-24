import { Tariff, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';
import {
    OCPITariff,
    OCPITariffElement,
} from '../ocpi/schema/modules/tariffs/types';
import { OCPIDisplayText } from '../ocpi/schema/general/types';
import { OCPIPrice } from '../ocpi/schema/general/types';
import { OCPIEnergyMix } from '../ocpi/schema/modules/locations/types';
import { OCPITariffType } from '../ocpi/schema/modules/tariffs/enums';

export type TariffWithRelations = Tariff;

export class TariffDbService {
    // ==================== OCPI Mapping Methods ====================

    public static mapPrismaTariffToOcpi(tariff: TariffWithRelations): OCPITariff {
        return {
            country_code: tariff.country_code,
            party_id: tariff.party_id,
            id: tariff.ocpi_tariff_id,
            currency: tariff.currency,
            type: (tariff.type as OCPITariffType | null) ?? undefined,
            tariff_alt_text: (tariff.tariff_alt_text as OCPIDisplayText[] | null) ?? undefined,
            tariff_alt_url: tariff.tariff_alt_url ?? undefined,
            min_price: (tariff.min_price as OCPIPrice | null) ?? undefined,
            max_price: (tariff.max_price as OCPIPrice | null) ?? undefined,
            start_date_time: tariff.start_date_time?.toISOString() ?? undefined,
            end_date_time: tariff.end_date_time?.toISOString() ?? undefined,
            energy_mix: (tariff.energy_mix as OCPIEnergyMix | null) ?? undefined,
            elements: (tariff.ocpi_tariff_element as unknown as OCPITariffElement[]) ?? [],
            last_updated: tariff.last_updated.toISOString(),
        };
    }

    private static mapOcpiTariffToPrisma(ocpiTariff: OCPITariff) {
        // Validate required fields
        if (!ocpiTariff.country_code) {
            throw new Error('OCPI tariff missing required field: country_code');
        }
        if (!ocpiTariff.party_id) {
            throw new Error('OCPI tariff missing required field: party_id');
        }
        if (!ocpiTariff.id) {
            throw new Error('OCPI tariff missing required field: id');
        }
        if (!ocpiTariff.currency) {
            throw new Error('OCPI tariff missing required field: currency');
        }
        if (!ocpiTariff.last_updated) {
            throw new Error('OCPI tariff missing required field: last_updated');
        }

        // Parse last_updated date safely
        let lastUpdatedDate: Date;
        try {
            lastUpdatedDate = new Date(ocpiTariff.last_updated);
            if (isNaN(lastUpdatedDate.getTime())) {
                throw new Error(`Invalid date format for last_updated: ${ocpiTariff.last_updated}`);
            }
        }
        catch {
            throw new Error(`Failed to parse last_updated date: ${ocpiTariff.last_updated}`);
        }

        // Parse optional dates safely
        const parseDate = (dateString: string | undefined): Date | null => {
            if (!dateString) {
                return null;
            }
            try {
                const date = new Date(dateString);
                return isNaN(date.getTime()) ? null : date;
            }
            catch {
                return null;
            }
        };

        return {
            country_code: ocpiTariff.country_code,
            party_id: ocpiTariff.party_id,
            ocpi_tariff_id: ocpiTariff.id,
            currency: ocpiTariff.currency,
            type: ocpiTariff.type ?? null,
            tariff_alt_text: ocpiTariff.tariff_alt_text
                ? (ocpiTariff.tariff_alt_text as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            tariff_alt_url: ocpiTariff.tariff_alt_url ?? null,
            min_price: ocpiTariff.min_price
                ? (ocpiTariff.min_price as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            max_price: ocpiTariff.max_price
                ? (ocpiTariff.max_price as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            start_date_time: parseDate(ocpiTariff.start_date_time),
            end_date_time: parseDate(ocpiTariff.end_date_time),
            energy_mix: ocpiTariff.energy_mix
                ? (ocpiTariff.energy_mix as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            ocpi_tariff_element: ocpiTariff.elements
                ? (ocpiTariff.elements as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            last_updated: lastUpdatedDate,
        };
    }

    // ==================== OCPI-Specific Methods ====================

    public static async findByOcpiTariffId(
        countryCode: string,
        partyId: string,
        tariffId: string,
        partnerId?: string,
    ): Promise<TariffWithRelations | null> {
        return databaseService.prisma.tariff.findFirst({
            where: {
                country_code: countryCode,
                party_id: partyId,
                ocpi_tariff_id: tariffId,
                ...(partnerId ? { partner_id: partnerId } : {}),
            },
        }) as Promise<TariffWithRelations | null>;
    }

    public static async upsertFromOcpiTariff(
        ocpiTariff: OCPITariff,
        partnerId: string,
    ): Promise<TariffWithRelations> {
        const prisma = databaseService.prisma;

        let tariffRecord = await prisma.tariff.findFirst({
            where: {
                country_code: ocpiTariff.country_code,
                party_id: ocpiTariff.party_id,
                ocpi_tariff_id: ocpiTariff.id,
            },
        });

        const tariffData = this.mapOcpiTariffToPrisma(ocpiTariff);

        if (tariffRecord) {
            tariffRecord = await prisma.tariff.update({
                where: { id: tariffRecord.id },
                data: {
                    ...tariffData,
                    partner: {
                        connect: { id: partnerId },
                    },
                },
            });
        }
        else {
            tariffRecord = await prisma.tariff.create({
                data: {
                    ...tariffData,
                    partner: {
                        connect: { id: partnerId },
                    },
                },
            });
        }

        return tariffRecord as TariffWithRelations;
    }

    // ==================== Database Query Methods ====================

    public static async getByFilters(
        queryArgs: Prisma.TariffFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false
    ): Promise<{
        records?: TariffWithRelations[],
        total_count?: number,
        has_next?: boolean,
        has_previous?: boolean,
    }> {
        const countFilters: Prisma.TariffCountArgs = {
            where: queryArgs.where,
        };

        // Get count
        const tariffsCount = await databaseService.prisma.tariff.count(countFilters);

        if (getCount) {
            return {
                total_count: tariffsCount
            };
        }

        // Check if there's a previous page
        let hasPrevious = true;
        if (page === 0 || tariffsCount === 0) {
            hasPrevious = false;
        }

        // Check if there's a next page
        let hasNext = true;
        if (perPage === 0 || (page + 1) * perPage >= tariffsCount) {
            hasNext = false;
        }

        if (perPage !== 0) {
            const skip = page * perPage;
            const take = perPage;

            queryArgs.skip = skip;
            queryArgs.take = take;
        }

        const tariffs = await databaseService.prisma.tariff.findMany(queryArgs);

        return {
            records: tariffs as TariffWithRelations[],
            total_count: tariffsCount,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.TariffFindManyArgs,
        page: number = 0,
        perPage: number = 0
    ): Promise<{
        records?: TariffWithRelations[],
        has_next?: boolean,
        has_previous?: boolean,
    }> {
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

        const tariffs = await databaseService.prisma.tariff.findMany(queryArgs);

        // Check if there's a next page
        let hasNext = false;
        if (perPage > 0 && tariffs.length > 0 && tariffs.length <= perPage) {
            hasNext = true;
        }

        return {
            records: tariffs as TariffWithRelations[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getById(
        tariffId: string,
        args: Omit<Prisma.TariffFindUniqueArgs, 'where'> = {}
    ): Promise<TariffWithRelations | null> {
        const tariff = await databaseService.prisma.tariff.findUnique({
            where: {
                id: tariffId
            },
            ...args,
        });

        return tariff as TariffWithRelations | null;
    }

    public static async getByOcpiTariffId(
        ocpiTariffId: string,
        args: Omit<Prisma.TariffFindUniqueArgs, 'where'> = {}
    ): Promise<TariffWithRelations | null> {
        const tariff = await databaseService.prisma.tariff.findFirst({
            where: {
                ocpi_tariff_id: ocpiTariffId,
            },
            ...args,
        });

        return tariff as TariffWithRelations | null;
    }


    public static async findAll(
        countryCode?: string,
        partyId?: string,
        limit?: number,
        offset?: number,
        partnerId?: string,
    ): Promise<TariffWithRelations[]> {
        const where: Prisma.TariffWhereInput = {};

        if (countryCode) {
            where.country_code = countryCode;
        }
        if (partyId) {
            where.party_id = partyId;
        }
        if (partnerId) {
            where.partner_id = partnerId;
        }

        return databaseService.prisma.tariff.findMany({
            where,
            take: limit,
            skip: offset,
            orderBy: {
                last_updated: 'desc',
            },
        }) as Promise<TariffWithRelations[]>;
    }

    // ==================== Create/Update/Delete Methods ====================

    public static async addTariff(data: Prisma.TariffCreateArgs): Promise<Tariff> {
        const tariff = await databaseService.prisma.tariff.create(data);
        return tariff;
    }

    public static async bulkAddTariff(data: Prisma.TariffCreateManyArgs): Promise<{ error?: unknown, count?: number }> {
        try {
            const tariffs = await databaseService.prisma.tariff.createMany(data);
            return tariffs;
        }
        catch (error) {
            return { error };
        }
    }

    public static async updateTariff(
        tariffId: string,
        updateFields: Prisma.TariffUpdateInput = {}
    ): Promise<Tariff> {
        const tariff = await databaseService.prisma.tariff.update({
            where: {
                id: tariffId
            },
            data: updateFields,
        });

        return tariff;
    }

    public static async deleteTariff(tariffId: string): Promise<Tariff> {
        const tariff = await databaseService.prisma.tariff.delete({
            where: {
                id: tariffId
            },
        });

        return tariff;
    }

    public static async getByOcpiTariffIds(ocpiTariffIds: string[]): Promise<TariffWithRelations[]> {
        return databaseService.prisma.tariff.findMany({
            where: {
                ocpi_tariff_id: { in: ocpiTariffIds },
            },
        }) as Promise<TariffWithRelations[]>;
    }
}
