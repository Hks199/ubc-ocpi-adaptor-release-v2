import { databaseService } from './database.service';
import { logger } from './logger.service';
import { cdsClient } from '../cds/client';
import { ExternalServiceError } from '../utils/errors';

export class SyncService {
    async syncLocationToCDS(locationId: string): Promise<void> {
        // try {
        //     logger.info('Syncing location to CDS', { locationId });

        //     const location = await databaseService.prisma.location.findUnique({
        //         where: { location_id: locationId },
        //     });

        //     if (!location) {
        //         throw new Error(`Location ${locationId} not found`);
        //     }

        //     // Convert to CDS format and push
        //     await cdsClient.pushLocation(location);

        //     // Log sync
        //     await databaseService.prisma.syncLog.create({
        //         data: {
        //             sync_type: 'locations',
        //             status: 'success',
        //             records_count: 1,
        //             completed_at: new Date(),
        //         },
        //     });

        //     logger.info('Location synced to CDS successfully', { locationId });
        // }
        // catch (error: any) {
        //     logger.error('Error syncing location to CDS', error, { locationId });

        //     // Log failed sync
        //     await databaseService.prisma.syncLog.create({
        //         data: {
        //             sync_type: 'locations',
        //             status: 'failed',
        //             records_count: 0,
        //             error_message: error.message,
        //             completed_at: new Date(),
        //         },
        //     });

        //     throw new ExternalServiceError('Failed to sync location to CDS', 'CDS', error);
        // }
    }

    async syncTariffToCDS(tariffId: string): Promise<void> {
        // try {
        //     logger.info('Syncing tariff to CDS', { tariffId });

        //     const tariff = await databaseService.prisma.tariff.findUnique({
        //         where: { tariff_id: tariffId },
        //     });

        //     if (!tariff) {
        //         throw new Error(`Tariff ${tariffId} not found`);
        //     }

        //     // Convert to CDS format and push
        //     await cdsClient.pushTariff(tariff);

        //     // Log sync
        //     await databaseService.prisma.syncLog.create({
        //         data: {
        //             sync_type: 'tariffs',
        //             status: 'success',
        //             records_count: 1,
        //             completed_at: new Date(),
        //         },
        //     });

        //     logger.info('Tariff synced to CDS successfully', { tariffId });
        // }
        // catch (error: any) {
        //     logger.error('Error syncing tariff to CDS', error, { tariffId });

        //     // Log failed sync
        //     await databaseService.prisma.syncLog.create({
        //         data: {
        //             sync_type: 'tariffs',
        //             status: 'failed',
        //             records_count: 0,
        //             error_message: error.message,
        //             completed_at: new Date(),
        //         },
        //     });

        //     throw new ExternalServiceError('Failed to sync tariff to CDS', 'CDS', error);
        // }
    }

    async syncAllLocationsToCDS(): Promise<{ success: number; failed: number } | void> {
        // try {
        //     logger.info('Syncing all locations to CDS');

        //     const locations = await databaseService.prisma.location.findMany();
        //     let success = 0;
        //     let failed = 0;

        //     for (const location of locations) {
        //         try {
        //             await this.syncLocationToCDS(location.location_id);
        //             success++;
        //         }
        //         catch (error) {
        //             failed++;
        //             logger.error('Failed to sync location', error as Error, {
        //                 locationId: location.location_id,
        //             });
        //         }
        //     }

        //     logger.info('Bulk location sync completed', { success, failed });

        //     return { success, failed };
        // }
        // catch (error: any) {
        //     logger.error('Error in bulk location sync', error);
        //     throw error;
        // }
    }

    async syncAllTariffsToCDS(): Promise<{ success: number; failed: number } | void> {
        // try {
        //     logger.info('Syncing all tariffs to CDS');

        //     const tariffs = await databaseService.prisma.tariff.findMany();
        //     let success = 0;
        //     let failed = 0;

        //     for (const tariff of tariffs) {
        //         try {
        //             await this.syncTariffToCDS(tariff.tariff_id);
        //             success++;
        //         }
        //         catch (error: any) {
        //             failed++;
        //             logger.error('Failed to sync tariff', error as Error, { tariffId: tariff.tariff_id });
        //         }
        //     }

        //     logger.info('Bulk tariff sync completed', { success, failed });

        //     return { success, failed };
        // }
        // catch (error: any) {
        //     logger.error('Error in bulk tariff sync', error);
        //     throw error;
        // }
    }
}

export const syncService = new SyncService();
