export default {
  driver: process.env.CACHE_DRIVER || "memory",
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    ttl: Number(process.env.CACHE_TTL) || 300,
  },
};
