import { RedisOptions } from 'ioredis';

export const redisConfig: RedisOptions = {
    host: 'localhost',
    port: 6379,
    password: undefined,
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
};
