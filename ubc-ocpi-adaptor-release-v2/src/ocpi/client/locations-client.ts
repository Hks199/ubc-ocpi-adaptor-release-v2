// import axios, { AxiosInstance } from 'axios';
// import { OCPILocation, OCPIResponse } from '../types';
// import { logger } from '../../services/logger.service';
// import { ExternalServiceError } from '../../utils/errors';
// import { credentialsModule } from '../modules/credentials';

// export class LocationsClient {
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

//     async fetchLocations(limit?: number, offset?: number): Promise<OCPILocation[]> {
//         try {
//             const params: any = {};
//             if (limit) params.limit = limit;
//             if (offset) params.offset = offset;

//             const response = await this.axiosInstance.get<OCPIResponse<OCPILocation[]>>(
//                 '/ocpi/v2.2.1/locations',
//                 { params }
//             );

//             if (response.data.status_code !== 1000) {
//                 throw new ExternalServiceError(
//                     `Failed to fetch locations: ${response.data.status_message}`,
//                     'CPO',
//                     new Error(response.data.status_message || 'Unknown error')
//                 );
//             }

//             return response.data.data || [];
//         }
//         catch (error: any) {
//             logger.error('Error fetching locations from CPO', error);
//             throw new ExternalServiceError('Failed to fetch locations from CPO', 'CPO', error);
//         }
//     }

//     async fetchLocation(locationId: string): Promise<OCPILocation | null> {
//         try {
//             const response = await this.axiosInstance.get<OCPIResponse<OCPILocation>>(
//                 `/ocpi/v2.2.1/locations/${locationId}`
//             );

//             if (response.data.status_code !== 1000) {
//                 if (response.data.status_code === 2001) {
//                     return null; // Not found
//                 }
//                 throw new ExternalServiceError(
//                     `Failed to fetch location: ${response.data.status_message}`,
//                     'CPO',
//                     new Error(response.data.status_message || 'Unknown error')
//                 );
//             }

//             return response.data.data || null;
//         }
//         catch (error: any) {
//             logger.error('Error fetching location from CPO', error, { locationId });
//             throw new ExternalServiceError('Failed to fetch location from CPO', 'CPO', error);
//         }
//     }
// }
