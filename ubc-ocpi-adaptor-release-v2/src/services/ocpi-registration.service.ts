// import { credentialsModule } from '../ocpi/modules/credentials';
// import { databaseService } from './database.service';
// import { logger } from './logger.service';
// import { ExternalServiceError } from '../utils/errors';

// export default class OCPIRegistrationService {
//     public static async registerWithCPO(registrationToken: string, cpoUrl: string): Promise<void> {
//         try {
//             logger.info('Initiating OCPI registration', { cpoUrl });

//             const response = await credentialsModule.register(registrationToken, cpoUrl);

//             if (response.status_code !== 1000) {
//                 throw new ExternalServiceError(
//                     `OCPI registration failed: ${response.status_message || 'Unknown error'}`,
//                     'CPO',
//                     new Error(response.status_message || 'Registration failed')
//                 );
//             }

//             logger.info('OCPI registration successful', {
//                 partyId: response.data?.party_id,
//                 countryCode: response.data?.country_code,
//             });
//         }
//         catch (error: any) {
//             logger.error('OCPI registration error', error);
//             throw error;
//         }
//     }

//     public static async getRegistrationStatus(cpoId: string): Promise<{ status: string; registeredAt?: Date }> {
//         try {
//             const credentials = await credentialsModule.getCredentials(cpoId);

//             if (!credentials) {
//                 return { status: 'not_registered' };
//             }

//             const connection = await databaseService.prisma.cpoConnection.findUnique({
//                 where: { cpo_id: cpoId },
//                 select: { status: true, registered_at: true },
//             });

//             return {
//                 status: connection?.status || 'unknown',
//                 registeredAt: connection?.registered_at || undefined,
//             };
//         }
//         catch (error: any) {
//             logger.error('Error getting registration status', error, { cpoId });
//             throw error;
//         }
//     }
// }

// export const ocpiRegistrationService = new OCPIRegistrationService();
