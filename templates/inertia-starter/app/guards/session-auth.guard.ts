import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext } from "@nyalajs/http";

/**
 * Gates every route that requires a logged-in user (e.g.
 * app/controllers/posts.controller.ts). Identical pattern to
 * templates/cms-starter/app/guards/session-auth.guard.ts — one app, no
 * cross-origin API, so @fastify/secure-session (already wired into
 * FastifyAdapter) is the auth mechanism, set by AuthController.login()/
 * register(), cleared by .logout(). See docs/inertia-starter-spec.md §3 for
 * why this starter uses sessions instead of the JWT pattern
 * basic-starter/saas-starter use.
 *
 * A failed guard here returns a plain 403 JSON body today (FastifyAdapter's
 * own behavior for `canActivate() === false`, not something this guard
 * controls) — routes that want a redirect-to-login experience instead
 * should check `currentUser(req)` inside the handler and issue a 302, the
 * same way an Inertia app conventionally handles "not logged in" without
 * changing the guard's binary contract.
 */
@Injectable()
export class SessionAuthGuard implements Guard {
    canActivate(context: ExecutionContext): boolean {
        const userId = context.request.session?.get("userId");
        if (!userId) return false;

        context.context.userId = userId;
        context.context.metadata.set("user", { userId });
        return true;
    }
}
