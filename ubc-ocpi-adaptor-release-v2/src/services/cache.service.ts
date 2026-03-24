import { logger } from './logger.service';

// Redis is disabled - cache service is a no-op
class CacheService {
    async get<T>(_key: string): Promise<T | null> {
        return null;
    }

    async set(_key: string, _value: any, _ttlSeconds?: number): Promise<boolean> {
        return false;
    }

    async delete(_key: string): Promise<boolean> {
        return false;
    }

    async exists(_key: string): Promise<boolean> {
        return false;
    }

    async flush(): Promise<void> {
        // No-op
    }

    async disconnect(): Promise<void> {
        // No-op
    }
}

export const cacheService = new CacheService();
