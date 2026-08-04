export default {
  driver: process.env.QUEUE_DRIVER || "bullmq",
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultQueue: process.env.QUEUE_DEFAULT || "default",
  retries: Number(process.env.QUEUE_RETRIES) || 3,
};
