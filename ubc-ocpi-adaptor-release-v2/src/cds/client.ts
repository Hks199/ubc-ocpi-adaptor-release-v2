import axios, { AxiosInstance } from 'axios';
import { appConfig } from '../config/app.config';
import { logger } from '../services/logger.service';
import { ExternalServiceError } from '../utils/errors';
import { locationMapper } from './mappers/location-mapper';
import { tariffMapper } from './mappers/tariff-mapper';

class CDSClient {
    private axiosInstance: AxiosInstance;

    constructor() {
        if (!appConfig.cds.baseUrl) {
            throw new Error('CDS_BASE_URL is not configured');
        }

        this.axiosInstance = axios.create({
            baseURL: appConfig.cds.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${appConfig.cds.apiKey}`,
            },
        });
    }

    async pushLocation(location: any): Promise<void> {
        try {
            // Convert OCPI location to CDS format
            const cdsLocation = locationMapper.toCDS(location);

            const response = await this.axiosInstance.post('/locations', cdsLocation);

            if (response.status !== 200 && response.status !== 201) {
                throw new ExternalServiceError(
                    `Failed to push location to CDS: ${response.statusText}`,
                    'CDS',
                    new Error(`HTTP ${response.status}`)
                );
            }

            logger.info('Location pushed to CDS successfully', { locationId: location.locationId });
        }
        catch (error: any) {
            logger.error('Error pushing location to CDS', error, {
                locationId: location.locationId,
            });
            throw new ExternalServiceError('Failed to push location to CDS', 'CDS', error);
        }
    }

    async pushTariff(tariff: any): Promise<void> {
        try {
            // Convert OCPI tariff to CDS format
            const cdsTariff = tariffMapper.toCDS(tariff);

            const response = await this.axiosInstance.post('/tariffs', cdsTariff);

            if (response.status !== 200 && response.status !== 201) {
                throw new ExternalServiceError(
                    `Failed to push tariff to CDS: ${response.statusText}`,
                    'CDS',
                    new Error(`HTTP ${response.status}`)
                );
            }

            logger.info('Tariff pushed to CDS successfully', { tariffId: tariff.tariffId });
        }
        catch (error: any) {
            logger.error('Error pushing tariff to CDS', error, { tariffId: tariff.tariffId });
            throw new ExternalServiceError('Failed to push tariff to CDS', 'CDS', error);
        }
    }
}

export const cdsClient = new CDSClient();
