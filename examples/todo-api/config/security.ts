/**
 * Security Configuration
 */

export default {
    rateLimit: {
        max: Number(process.env.RATE_LIMIT_MAX) || 100,
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
        skipSuccessfulRequests: false,
    },
    helmet: {
        enabled: true,
        contentSecurityPolicy: process.env.NODE_ENV === "production",
    },
    csrf: {
        enabled: process.env.CSRF_ENABLED === "true",
        secret: process.env.CSRF_SECRET || "csrf-secret-change-me",
    },
};
