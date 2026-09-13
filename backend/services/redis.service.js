import Redis from 'ioredis';

const createTestRedisClient = () => {
    const store = new Map();

    return {
        get: async (key) => store.get(key),
        getdel: async (key) => {
            const value = store.get(key);
            store.delete(key);
            return value;
        },
        set: async (key, value) => {
            store.set(key, value);
            return 'OK';
        },
        del: async (key) => {
            store.delete(key);
            return 1;
        },
        on: () => {}
    };
};

const redisOptions = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379)
};

if (process.env.REDIS_PASSWORD) redisOptions.password = process.env.REDIS_PASSWORD;

const redisClient = process.env.NODE_ENV === 'test'
    ? createTestRedisClient()
    : new Redis(redisOptions);

redisClient.on('connect', () => console.log('Redis connected'));
redisClient.on('error', (error) => console.error('Redis error:', error.message));

export default redisClient;
