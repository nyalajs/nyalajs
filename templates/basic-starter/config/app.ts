/**
 * Application Configuration
 */

export default {
    name: process.env.APP_NAME || "Nyala MVC App",
    env: process.env.NODE_ENV || "development",
    url: process.env.APP_URL || "http://localhost:3000",
    version: "1.0.0",
    debug: process.env.APP_DEBUG === "true",
    timezone: process.env.APP_TIMEZONE || "UTC",
};
