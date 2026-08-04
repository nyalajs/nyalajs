import { TenantMiddleware } from "@nyalajs/tenancy";

/**
 * Global Middleware Configuration
 *
 * Middleware defined here will be applied to every HTTP request in the order listed.
 * Ensure the middleware classes implement the `Middleware` interface, and are
 * also registered in bootstrap/app.module.ts's `providers` so the DI
 * container can construct them.
 */
export default {
    global: [
        // Resolves the current tenant (see bootstrap/app.module.ts) before
        // any repository/Model code runs, so tenant isolation is enforced
        // on every request rather than something each route has to opt into.
        TenantMiddleware,
        // require("../middleware/request-logger.middleware").RequestLoggerMiddleware,
    ],
};
