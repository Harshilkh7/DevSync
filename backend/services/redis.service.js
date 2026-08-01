import Redis from 'ioredis';

const createTestRedisClient = () => {
    const store = new Map();

    return {
        get: async (key) => store.get(key),
        set: async (key, value) => {
            store.set(key, value);
            return 'OK';
        },
        on: () => {}
    };
};

const redisClient = process.env.NODE_ENV === 'test'
    ? createTestRedisClient()
    : new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD
    });

redisClient.on('connect', () => {
    console.log('Redis connected');
});

export default redisClient;