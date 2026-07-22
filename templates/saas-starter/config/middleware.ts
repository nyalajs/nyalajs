/**
 * Global Middleware Configuration
 * 
 * Middleware defined here will be applied to every HTTP request in the order listed.
 * Ensure the middleware classes implement the `Middleware` interface.
 */
export default {
    global: [
        // require("../middleware/request-logger.middleware").RequestLoggerMiddleware,
    ],
};
