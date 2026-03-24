// import axios, { AxiosInstance } from 'axios';
// import { OCPITariff, OCPIResponse } from '../types';
// import { logger } from '../../services/logger.service';
// import { ExternalServiceError } from '../../utils/errors';
// import { credentialsModule } from '../modules/credentials';

// export class TariffsClient {
//     private axiosInstance: AxiosInstance;

//     constructor(cpoId: string, cpoUrl: string) {
//         this.axiosInstance = axios.create({
//             baseURL: cpoUrl,
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//         });

//         // Add request interceptor for authentication
//         this.axiosInstance.interceptors.request.use(async (config) => {
//             const credentials = await credentialsModule.getCredentials(cpoId);
//             if (credentials) {
//                 config.headers.Authorization = `Token ${credentials.token}`;
//             }
//             return config;
//         });
//     }

//     async fetchTariffs(limit?: number, offset?: number): Promise<OCPITariff[]> {
//         try {
//             const params: any = {};
//             if (limit) params.limit = limit;
//             if (offset) params.offset = offset;

//             const response = await this.axiosInstance.get<OCPIResponse<OCPITariff[]>>(
//                 '/ocpi/v2.2.1/tariffs',
//                 { params }
//             );

//             if (response.data.status_code !== 1000) {
//                 throw new ExternalServiceError(
//                     `Failed to fetch tariffs: ${response.data.status_message}`,
//                     'CPO',
//                     new Error(response.data.status_message || 'Unknown error')
//                 );
//             }

//             return response.data.data || [];
//         }
//         catch (error: any) {
//             logger.error('Error fetching tariffs from CPO', error);
//             throw new ExternalServiceError('Failed to fetch tariffs from CPO', 'CPO', error);
//         }
//     }

//     async fetchTariff(tariffId: string): Promise<OCPITariff | null> {
//         try {
//             const response = await this.axiosInstance.get<OCPIResponse<OCPITariff>>(
//                 `/ocpi/v2.2.1/tariffs/${tariffId}`
//             );

//             if (response.data.status_code !== 1000) {
//                 if (response.data.status_code === 2001) {
//                     return null; // Not found
//                 }
//                 throw new ExternalServiceError(
//                     `Failed to fetch tariff: ${response.data.status_message}`,
//                     'CPO',
//                     new Error(response.data.status_message || 'Unknown error')
//                 );
//             }

//             return response.data.data || null;
//         }
//         catch (error: any) {
//             logger.error('Error fetching tariff from CPO', error, { tariffId });
//             throw new ExternalServiceError('Failed to fetch tariff from CPO', 'CPO', error);
//         }
//     }
// }
