/**
 * Server Configuration
 */

export default {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
    bodyLimit: Number(process.env.BODY_LIMIT) || 1_048_576, // 1MB
    requestTimeout: Number(process.env.REQUEST_TIMEOUT) || 30000, // 30 seconds
};
