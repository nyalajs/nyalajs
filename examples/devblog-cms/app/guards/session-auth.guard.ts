import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext } from "@nyalajs/http";

/**
 * Gates every admin/*.controller.ts route. One app, no cross-origin API, so
 * @fastify/secure-session (already wired into FastifyAdapter) is the auth
 * mechanism — set by AdminAuthController.login(), cleared by .logout().
 *
 * Also populates context.context.metadata's "user" entry in the shape
 * @nyalajs/security's RolesGuard/@Roles() expect ({ roles: [...] }), so
 * admin-only screens (e.g. Users) can just add @UseGuards(SessionAuthGuard,
 * RolesGuard) + @Roles("admin") instead of a second bespoke role check.
 */
@Injectable()
export class SessionAuthGuard implements Guard {
    canActivate(context: ExecutionContext): boolean {
        const userId = context.request.session?.get("userId");
        const role = context.request.session?.get("role");

        if (!userId) return false;

        context.context.userId = userId;
        context.context.metadata.set("user", { userId, roles: role ? [role] : [] });
        return true;
    }
}
