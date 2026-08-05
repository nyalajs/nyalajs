/**
 * Shared ("always") props merged into every InertiaResponse for the
 * current request — current user, flash messages, etc.
 *
 * Request-scoped state in this codebase has two real precedents:
 *   1. DI-container REQUEST scope (Container.createRequestScope(), see
 *      packages/core/src/di/container.ts) — but Middleware.use(req, res,
 *      next) (packages/http/src/middleware/middleware.interface.ts) only
 *      receives the raw Fastify request/reply, not the per-request
 *      container, so a middleware has no way to register into it.
 *   2. Properties decorated directly onto the Fastify `request` object —
 *      this is how @fastify/secure-session already works (`req.session`,
 *      read directly by controllers/guards, e.g.
 *      templates/cms-starter/app/guards/session-auth.guard.ts).
 *
 * Shared props follow precedent #2: a plain object attached to `request`,
 * populated by ordinary Middleware, read by InertiaResponse/inertia().
 * No new global-state mechanism — same shape as the session object it sits
 * next to.
 */
export interface InertiaSharedPropsCarrier {
    __inertiaShared?: Record<string, unknown>;
}

/**
 * Merges `props` into the current request's shared-props bag. Call from
 * middleware or a guard (anything that runs before the controller) to make
 * a value available on every InertiaResponse for this request — e.g. the
 * current user, or a flash message read out of the session.
 *
 * @example
 *   export class ShareCurrentUserMiddleware implements Middleware {
 *     async use(req: any, res: any, next: NextFunction) {
 *       shareProps(req, { user: req.session?.get("user") ?? null });
 *       await next();
 *     }
 *   }
 */
export function shareProps(request: InertiaSharedPropsCarrier, props: Record<string, unknown>): void {
    request.__inertiaShared = { ...request.__inertiaShared, ...props };
}

/** Reads the current request's accumulated shared props (empty object if none were set). */
export function getSharedProps(request: InertiaSharedPropsCarrier): Record<string, unknown> {
    return request.__inertiaShared ?? {};
}
