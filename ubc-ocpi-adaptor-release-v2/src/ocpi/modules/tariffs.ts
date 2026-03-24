// import { z } from 'zod';
// import { logger } from '../../services/logger.service';
// import { syncService } from '../../services/sync.service';
// import { ValidationError } from '../../utils/errors';
// import { OCPIResponse, OCPITariff } from '../types';
// import { tariffSchema } from '../validators';
// import { TariffDbService } from '../../services/tariff-db.service';

// export class TariffsModule {
//     async putTariff(
//         tariffId: string,
//         tariff: OCPITariff,
//         cpoId: string
//     ): Promise<OCPIResponse<OCPITariff>> {
//         try {
//             // Validate tariff
//             tariffSchema.parse(tariff);

//             // Store or update tariff in database using TariffDbService
//             await TariffDbService.upsertFromOcpiTariff(tariff);

//             logger.info('Tariff stored/updated', { tariffId: tariff.id, countryCode: tariff.country_code, partyId: tariff.party_id });

//             // Trigger CDS sync for this tariff
//             await syncService.syncTariffToCDS(tariff.id).catch((error) => {
//                 logger.error('Error syncing tariff to CDS', error, { tariffId: tariff.id });
//                 // Don't fail the request if CDS sync fails
//             });

//             return {
//                 status_code: 1000,
//                 data: tariff,
//                 timestamp: new Date().toISOString(),
//             };
//         }
//         catch (error: any) {
//             logger.error('Error putting tariff', error, { tariffId });
//             if (error instanceof z.ZodError) {
//                 throw new ValidationError('Invalid tariff data', error.errors);
//             }
//             throw error;
//         }
//     }

//     async getTariff(tariffId: string): Promise<OCPITariff | null> {
//         try {
//             // First, try to find by database ID (UUID format)
//             const tariff = await TariffDbService.getById(tariffId);

//             if (tariff) {
//                 return TariffDbService.mapPrismaTariffToOcpi(tariff);
//             }

//             // If not found by database ID, try to find by OCPI tariff ID
//             // Search all tariffs and find one matching the OCPI tariff ID
//             const allTariffs = await TariffDbService.findAll(undefined, undefined, undefined, undefined);
//             const matchingTariff = allTariffs.find(t => t.ocpi_tariff_id === tariffId);

//             if (matchingTariff) {
//                 return TariffDbService.mapPrismaTariffToOcpi(matchingTariff);
//             }

//             return null;
//         }
//         catch (error: any) {
//             logger.error('Error getting tariff', error, { tariffId });
//             throw error;
//         }
//     }

//     async getTariffs(limit?: number, offset?: number): Promise<OCPITariff[]> {
//         try {
//             const tariffs = await TariffDbService.findAll(undefined, undefined, limit, offset);
//             return tariffs.map((tariff) => TariffDbService.mapPrismaTariffToOcpi(tariff));
//         }
//         catch (error: any) {
//             logger.error('Error getting tariffs', error);
//             throw error;
//         }
//     }
// }

// export const tariffsModule = new TariffsModule();
