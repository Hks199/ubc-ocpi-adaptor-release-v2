import dotenv from 'dotenv';

dotenv.config();

export const appConfig = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '6001', 10),
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production-min-32-characters',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    cds: {
        baseUrl: process.env.CDS_BASE_URL || 'https://cds.example.com',
        apiKey: process.env.CDS_API_KEY || 'your-cds-api-key',
    },
};
