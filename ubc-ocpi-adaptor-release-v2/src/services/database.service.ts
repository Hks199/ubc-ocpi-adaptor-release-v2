import { PrismaClient } from '@prisma/client';
import { logger } from './logger.service';
import { prismaConfig } from '../config/prisma.config';

class DatabaseService {
    private client: PrismaClient;

    constructor() {
        this.client = new PrismaClient({
            datasourceUrl: prismaConfig.datasourceUrl,
            log: [
                { level: 'query', emit: 'event' },
                { level: 'error', emit: 'stdout' },
                { level: 'warn', emit: 'stdout' },
            ],
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.client.$on('query' as never, (e: any) => {
            if (process.env.NODE_ENV === 'development') {
                logger.debug('Prisma Query', {
                    query: e.query,
                    params: e.params,
                    duration: e.duration,
                });
            }
        });
    }

    get prisma(): PrismaClient {
        return this.client;
    }

    async connect(): Promise<void> {
        try {
            await this.client.$connect();
            logger.info('Database connected successfully');
        }
        catch (error) {
            logger.error('Database connection failed', error as Error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.client.$disconnect();
            logger.info('Database disconnected');
        }
        catch (error) {
            logger.error('Error disconnecting from database', error as Error);
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.client.$queryRaw`SELECT 1`;
            return true;
        }
        catch (error) {
            logger.error('Database health check failed', error as Error);
            return false;
        }
    }
}

export const databaseService = new DatabaseService();
