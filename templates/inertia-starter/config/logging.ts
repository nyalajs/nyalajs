/**
 * Logging Configuration
 */

export default {
    level: process.env.LOG_LEVEL || "info",
    pretty: process.env.NODE_ENV !== "production",
};
