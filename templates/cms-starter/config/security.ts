export default {
    rateLimit: {
        max: Number(process.env.RATE_LIMIT_MAX) || 100,
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    },
};
