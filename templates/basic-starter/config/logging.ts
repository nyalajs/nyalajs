/**
 * Logging Configuration
 */

export default {
    level: process.env.LOG_LEVEL || "info",
    pretty: process.env.NODE_ENV !== "production",
    file: {
        enabled: process.env.LOG_FILE_ENABLED === "true",
        path: process.env.LOG_FILE_PATH || "./storage/logs/app.log",
        maxSize: "10m",
        maxFiles: 5,
    },
    console: {
        enabled: true,
        colors: true,
    },
};
