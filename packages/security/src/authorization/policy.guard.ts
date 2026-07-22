import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException } from "@nyalajs/http";
import { getPolicyMetadata, defaultActionForMethod, Policy } from "./policy";

/**
 * Guard that evaluates the `@UsePolicy` attached to the current route.
 *
 * Expects that `AuthGuard` has already run and placed a `user` object in
 * `context.metadata.get("user")`.
 *
 * Register it alongside `AuthGuard`:
 *
 * @example
 *   @UseGuards(AuthGuard, PolicyGuard)
 *   @UsePolicy(PostPolicy, "update")
 *   @Put("/:id")
 *   update() { ... }
 */
@Injectable()
export class PolicyGuard implements Guard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const { route, context: reqCtx, container } = context;

        if (!route) return true;

        // Check method-level policy first, then class-level
        const meta =
            getPolicyMetadata(route.controller.prototype, route.handlerName) ??
            getPolicyMetadata(route.controller);

        if (!meta) return true; // No policy declared → allow

        const { PolicyClass, action, resourceArg } = meta;

        // Resolve the policy from DI (so it can have injected dependencies)
        let policy: Policy;
        try {
            policy = container.resolve<Policy>(PolicyClass);
        } catch {
            // Policy not in DI — instantiate directly
            policy = new (PolicyClass as any)();
        }

        const user = reqCtx.metadata.get("user");
        const resource = resourceArg !== undefined ? (context.request as any).args?.[resourceArg] : undefined;

        // `before()` short-circuit
        if (typeof policy.before === "function") {
            const result = policy.before(user, resource);
            if (result === true)  return true;
            if (result === false) throw new ForbiddenException("Policy denied access");
            // undefined → fall through
        }

        // Determine which action to call
        const actionName = action ?? defaultActionForMethod(route.method);
        const actionFn = (policy as any)[actionName] as ((...args: any[]) => boolean | Promise<boolean>) | undefined;

        if (typeof actionFn !== "function") {
            // No matching action → deny by default
            throw new ForbiddenException(`Policy "${PolicyClass.name}" has no action "${actionName}"`);
        }

        const allowed = await Promise.resolve(actionFn.call(policy, user, resource));

        if (!allowed) {
            throw new ForbiddenException("Policy denied access");
        }

        return true;
    }
}
