// import { Request } from "express";
// import { HttpResponse } from "../../types/responses";
// import { AdminResponsePayload } from "../types/responses";
// import { ValidationError } from "../../utils/errors";
// import { TariffsClient } from "../../ocpi/client/tariffs-client";
// import { tariffsModule } from "../../ocpi/modules/tariffs";
// import { logger } from "../../services/logger.service";
// import { syncService } from "../../services/sync.service";

// export default class AdminTariffsModule {
//     public static async fetchTariffs(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
//         const { cpoId, cpoUrl } = req.body;

//         if (!cpoId || !cpoUrl) {
//             throw new ValidationError('CPO ID and CPO URL are required');
//         }

//         const client = new TariffsClient(cpoId, cpoUrl);
//         const tariffs = await client.fetchTariffs();

//         // Store tariffs in database
//         let stored = 0;
//         for (const tariff of tariffs) {
//             try {
//                 await tariffsModule.putTariff(tariff.id, tariff, cpoId);
//                 stored++;
//             }
//             catch (error) {
//                 const err = error instanceof Error ? error : new Error(String(error));
//                 logger.error('Error storing tariff', err, { tariffId: tariff.id });
//             }
//         }

//         return {
//             payload: {
//                 data: {
//                     success: true,
//                     fetched: tariffs.length,
//                     stored,
//                     message: `Fetched ${tariffs.length} tariffs, stored ${stored}`,
//                 },
//             },
//         };
//     }

//     public static async syncToCDS(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
//         const { tariffId } = req.body;

//         if (tariffId) {
//             // Sync single tariff
//             await syncService.syncTariffToCDS(tariffId);
//             return {
//                 payload: {
//                     data: {
//                         success: true,
//                         message: `Tariff ${tariffId} synced to CDS`,
//                     },
//                 },
//             };
//         }
//         else {
//             // Sync all tariffs
//             const result = await syncService.syncAllTariffsToCDS();
//             return {
//                 payload: {
//                     data: {
//                         success: true,
//                         message: `Synced ${result.success} tariffs to CDS, ${result.failed} failed`,
//                         successCount: result.success,
//                         failed: result.failed,
//                     },
//                 },
//             };
//         }
//     }

//     public static async getTariffs(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
//         const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
//         const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

//         const tariffs = await tariffsModule.getTariffs(limit, offset);

//         return {
//             payload: {
//                 data: {
//                     success: true,
//                     data: tariffs,
//                     count: tariffs.length,
//                 },
//             },
//         };
//     }

//     public static async getTariff(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
//         const tariffId = req.params.tariff_id;
//         const tariff = await tariffsModule.getTariff(tariffId);

//         if (!tariff) {
//             return {
//                 httpStatus: 404,
//                 payload: {
//                     data: {
//                         success: false,
//                         message: 'Tariff not found',
//                     },
//                 },
//             };
//         }

//         return {
//             payload: {
//                 data: {
//                     success: true,
//                     data: tariff,
//                 },
//             },
//         };
//     }
// }

