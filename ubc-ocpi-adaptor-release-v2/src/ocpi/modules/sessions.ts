// import { z } from 'zod';
// import { OCPISession, OCPIResponse } from '../types';
// import { sessionSchema } from '../validators';
// import { databaseService } from '../../services/database.service';
// import { logger } from '../../services/logger.service';
// import { ValidationError, NotFoundError } from '../../utils/errors';

// export class SessionsModule {
//     async createSession(session: OCPISession): Promise<OCPIResponse<OCPISession>> {
//         try {
//             sessionSchema.parse(session);

//             // Find location
//             const location = await databaseService.prisma.location.findUnique({
//                 where: { location_id: session.location.id },
//             });

//             if (!location) {
//                 throw new NotFoundError('Location', session.location.id);
//             }

//             // Create session in database
//             await databaseService.prisma.session.create({
//                 data: {
//                     session_id: session.id,
//                     location_id: session.location.id,
//                     evse_uid: session.location.evse?.uid || null,
//                     connector_id: session.location.evse?.connector_id || null,
//                     token: session.auth_id,
//                     start_date_time: new Date(session.start_date_time),
//                     end_date_time: session.end_date_time ? new Date(session.end_date_time) : null,
//                     kwh: session.kwh,
//                     status: session.status,
//                 },
//             });

//             logger.info('Session created', { sessionId: session.id });

//             return {
//                 status_code: 1000,
//                 data: session,
//                 timestamp: new Date().toISOString(),
//             };
//         }
//         catch (error: any) {
//             logger.error('Error creating session', error);
//             if (error instanceof z.ZodError) {
//                 throw new ValidationError('Invalid session data', error.errors);
//             }
//             throw error;
//         }
//     }

//     async getSession(sessionId: string): Promise<OCPISession | null> {
//         try {
//             const session = await databaseService.prisma.session.findUnique({
//                 where: { session_id: sessionId },
//                 include: { location: true },
//             });

//             if (!session) {
//                 return null;
//             }

//             return this.mapToOCPISession(session);
//         }
//         catch (error: any) {
//             logger.error('Error getting session', error, { sessionId });
//             throw error;
//         }
//     }

//     async getSessions(limit?: number, offset?: number): Promise<OCPISession[]> {
//         try {
//             const sessions = await databaseService.prisma.session.findMany({
//                 take: limit,
//                 skip: offset,
//                 include: { location: true },
//                 orderBy: { start_date_time: 'desc' },
//             });

//             return sessions.map((session) => this.mapToOCPISession(session));
//         }
//         catch (error: any) {
//             logger.error('Error getting sessions', error);
//             throw error;
//         }
//     }

//     async updateSession(
//         sessionId: string,
//         updates: Partial<OCPISession>
//     ): Promise<OCPIResponse<OCPISession>> {
//         try {
//             const session = await databaseService.prisma.session.findUnique({
//                 where: { session_id: sessionId },
//             });

//             if (!session) {
//                 throw new NotFoundError('Session', sessionId);
//             }

//             await databaseService.prisma.session.update({
//                 where: { session_id: sessionId },
//                 data: {
//                     end_date_time: updates.end_date_time
//                         ? new Date(updates.end_date_time)
//                         : undefined,
//                     kwh: updates.kwh,
//                     status: updates.status,
//                 },
//             });

//             const updated = await this.getSession(sessionId);
//             if (!updated) {
//                 throw new NotFoundError('Session', sessionId);
//             }

//             return {
//                 status_code: 1000,
//                 data: updated,
//                 timestamp: new Date().toISOString(),
//             };
//         }
//         catch (error: any) {
//             logger.error('Error updating session', error, { sessionId });
//             throw error;
//         }
//     }

//     private mapToOCPISession(session: any): OCPISession {
//         return {
//             id: session.sessionId,
//             start_date_time: session.startDateTime.toISOString(),
//             end_date_time: session.endDateTime?.toISOString(),
//             kwh: session.kwh || 0,
//             auth_id: session.token,
//             auth_method: 'AUTH_REQUEST',
//             location: {
//                 id: session.location.locationId,
//                 name: session.location.name || undefined,
//                 country: 'IN', // Should be from location
//                 evse: session.evseUid
//                     ? {
//                           uid: session.evseUid,
//                           connector_id: session.connectorId || undefined,
//                       }
//                     : undefined,
//             },
//             currency: 'INR', // Should be configurable
//             status: session.status as any,
//             last_updated: session.updatedAt.toISOString(),
//         };
//     }
// }

// export const sessionsModule = new SessionsModule();
