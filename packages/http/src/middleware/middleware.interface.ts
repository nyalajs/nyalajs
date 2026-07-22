/**
 * Middleware interface — matches the `use(req, res, next)` convention
 * used by Express/Fastify and Nyala's own TenantMiddleware.
 *
 * Implement this interface and register globally via `app.use(middleware)`
 * on `NyalaApplication`, or per-route by adding to `app/middleware/`.
 *
 * @example
 *   export class RequestIdMiddleware implements Middleware {
 *     async use(req: any, res: any, next: NextFunction): Promise<void> {
 *       req.requestId = crypto.randomUUID();
 *       await next();
 *     }
 *   }
 */
export type NextFunction = () => Promise<void>;

export interface Middleware {
    use(req: any, res: any, next: NextFunction): Promise<void>;
}
