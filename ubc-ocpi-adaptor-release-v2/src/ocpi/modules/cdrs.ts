// import { z } from 'zod';
// import { OCPICDR, OCPIResponse } from '../types';
// import { cdrSchema } from '../validators';
// import { databaseService } from '../../services/database.service';
// import { logger } from '../../services/logger.service';
// import { ValidationError, NotFoundError } from '../../utils/errors';

// export class CDRsModule {
//     async createCDR(cdr: OCPICDR): Promise<OCPIResponse<OCPICDR>> {
//         try {
//             cdrSchema.parse(cdr);

//             // Find location
//             const location = await databaseService.prisma.location.findUnique({
//                 where: { location_id: cdr.location.id },
//             });

//             if (!location) {
//                 throw new NotFoundError('Location', cdr.location.id);
//             }

//             // Find session if sessionId is provided
//             let sessionId = null;
//             if (cdr.id) {
//                 const session = await databaseService.prisma.session.findFirst({
//                     where: {
//                         location_id: cdr.location.id,
//                         start_date_time: new Date(cdr.start_date_time),
//                     },
//                 });
//                 sessionId = session?.session_id || null;
//             }

//             // Create CDR in database
//             await databaseService.prisma.cdr.create({
//                 data: {
//                     cdr_id: cdr.id,
//                     session_id: sessionId,
//                     location_id: cdr.location.id,
//                     evse_uid: cdr.location.evse?.uid || null,
//                     connector_id: cdr.location.evse?.connector_id || null,
//                     start_date_time: new Date(cdr.start_date_time),
//                     end_date_time: new Date(cdr.end_date_time),
//                     total_cost: cdr.total_cost.incl_vat,
//                     currency: cdr.currency,
//                     kwh: cdr.total_energy,
//                 },
//             });

//             logger.info('CDR created', { cdrId: cdr.id });

//             return {
//                 status_code: 1000,
//                 data: cdr,
//                 timestamp: new Date().toISOString(),
//             };
//         }
//         catch (error: any) {
//             logger.error('Error creating CDR', error);
//             if (error instanceof z.ZodError) {
//                 throw new ValidationError('Invalid CDR data', error.errors);
//             }
//             throw error;
//         }
//     }

//     async getCDR(cdrId: string): Promise<OCPICDR | null> {
//         try {
//             const cdr = await databaseService.prisma.cdr.findUnique({
//                 where: { cdr_id: cdrId },
//                 include: { location: true, session: true },
//             });

//             if (!cdr) {
//                 return null;
//             }

//             return this.mapToOCPICDR(cdr);
//         }
//         catch (error: any) {
//             logger.error('Error getting CDR', error, { cdrId });
//             throw error;
//         }
//     }

//     async getCDRs(limit?: number, offset?: number): Promise<OCPICDR[]> {
//         try {
//             const cdrs = await databaseService.prisma.cdr.findMany({
//                 take: limit,
//                 skip: offset,
//                 include: { location: true },
//                 orderBy: { start_date_time: 'desc' },
//             });

//             return cdrs.map((cdr) => this.mapToOCPICDR(cdr));
//         }
//         catch (error: any) {
//             logger.error('Error getting CDRs', error);
//             throw error;
//         }
//     }

//     private mapToOCPICDR(cdr: any): OCPICDR {
//         return {
//             id: cdr.cdr_id,
//             start_date_time: cdr.start_date_time.toISOString(),
//             end_date_time: cdr.end_date_time.toISOString(),
//             auth_id: cdr.session?.token || '',
//             auth_method: 'AUTH_REQUEST',
//             location: {
//                 id: cdr.location.location_id,
//                 name: cdr.location.name || undefined,
//                 country: 'IN',
//                 evse: cdr.evseUid
//                     ? {
//                           uid: cdr.evseUid,
//                           connector_id: cdr.connectorId || undefined,
//                       }
//                     : undefined,
//             },
//             currency: cdr.currency,
//             charging_periods: [], // Should be stored in DB
//             total_cost: {
//                 excl_vat: cdr.total_cost * 0.9, // Approximate
//                 incl_vat: cdr.total_cost,
//             },
//             total_energy: cdr.kwh,
//             last_updated: cdr.updated_at.toISOString(),
//         };
//     }
// }

// export const cdrsModule = new CDRsModule();
