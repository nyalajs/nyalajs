import { Middleware, NextFunction } from "@nyalajs/http";
import { shareProps } from "./shared-props";

/**
 * Resolves shared props for the current request. Return a plain object (or
 * a Promise of one) — merged into every InertiaResponse rendered for this
 * request via shareProps() (packages/inertia/src/shared-props.ts).
 */
export type SharedPropsResolver = (request: any) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Register with FastifyAdapter.addMiddleware() (or a per-route middleware
 * list) to make a resolver's output available as shared props on every
 * InertiaResponse for the request — the concrete implementation of
 * "InertiaShareMiddleware" from docs/inertia-starter-spec.md's Open
 * Question #4. A thin Middleware wrapper around shareProps() so apps don't
 * need to hand-write the same `req.__inertiaShared = {...}` boilerplate.
 *
 * @example
 *   app.addMiddleware(new InertiaShareMiddleware(async (req) => ({
 *       user: req.session?.get("user") ?? null,
 *   })));
 */
export class InertiaShareMiddleware implements Middleware {
    constructor(private readonly resolve: SharedPropsResolver) {}

    async use(req: any, _res: any, next: NextFunction): Promise<void> {
        const props = await this.resolve(req);
        shareProps(req, props);
        await next();
    }
}
