import { LoggerOptions } from 'winston';
import { appConfig } from './app.config';

export const getLoggerConfig = (): LoggerOptions => {
    const cloudProvider = process.env.CLOUD_PROVIDER || 'local';
    const logLevel = process.env.LOG_LEVEL || 'info';

    const baseConfig: LoggerOptions = {
        level: logLevel,
        format: require('winston').format.combine(
            require('winston').format.timestamp(),
            require('winston').format.errors({ stack: true }),
            require('winston').format.json()
        ),
        defaultMeta: { service: 'ubc-ocpi-adaptor' },
        transports: [
            new (require('winston').transports.Console)({
                format: require('winston').format.combine(
                    require('winston').format.colorize(),
                    require('winston').format.simple()
                ),
            }),
        ],
    };

    // Add cloud-specific transports based on provider
    // Ensure transports is always an array for type safety
    const transports = Array.isArray(baseConfig.transports)
        ? baseConfig.transports
        : baseConfig.transports
            ? [baseConfig.transports]
            : [];

    if (cloudProvider === 'gcp' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
            const { LoggingWinston } = require('@google-cloud/logging-winston');
            transports.push(new LoggingWinston());
        }
        catch (error) {
            console.warn('GCP logging transport not available:', error);
        }
    }
    else if (cloudProvider === 'aws') {
        try {
            const WinstonCloudWatch = require('winston-cloudwatch');
            transports.push(
                new WinstonCloudWatch({
                    logGroupName: 'ubc-ocpi-adaptor',
                    logStreamName: appConfig.nodeEnv,
                    awsRegion: process.env.AWS_REGION || 'us-east-1',
                    messageFormatter: ({ level, message, meta }: any) => {
                        return `[${level}] ${message} ${JSON.stringify(meta)}`;
                    },
                })
            );
        }
        catch (error) {
            console.warn('AWS CloudWatch transport not available:', error);
        }
    }
    else if (cloudProvider === 'azure') {
        try {
            const AzureBlobTransport = require('winston-azure-blob-transport');
            transports.push(
                new AzureBlobTransport({
                    account: {
                        name: process.env.AZURE_STORAGE_ACCOUNT_NAME || '',
                        key: process.env.AZURE_STORAGE_ACCOUNT_KEY || '',
                    },
                    containerName: 'logs',
                    blobName: 'ubc-ocpi-adaptor',
                })
            );
        }
        catch (error) {
            console.warn('Azure blob transport not available:', error);
        }
    }

    baseConfig.transports = transports;

    return baseConfig;
};
