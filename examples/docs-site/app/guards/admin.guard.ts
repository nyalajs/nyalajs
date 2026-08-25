import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext } from "@nyalajs/http";

/**
 * Gates the mutating routes on DocsController (create/update/destroy — see
 * app/controllers/docs.controller.ts's per-method @UseGuards(AdminGuard))
 * behind a single admin password, set via ADMIN_PASSWORD_HASH. Same
 * pattern as templates/inertia-starter's SessionAuthGuard — session-based,
 * @fastify/secure-session is already wired into FastifyAdapter — just
 * checking one boolean flag instead of a real per-user userId, since this
 * app has exactly one admin, not a users table (a docs demo doesn't need
 * a full registration system to close the "anyone can edit the docs"
 * gap).
 *
 * A failed guard here returns a plain 403 JSON body (FastifyAdapter's own
 * behavior for `canActivate() === false`, not something this guard
 * controls — see fastify-adapter.ts's own canActivate branch). Fine for
 * create()/update()/destroy(), which are only ever reached via a
 * same-origin form POST/PUT/DELETE the client only renders once
 * usePage().props.isAdmin is true — but NOT applied to createPage()/
 * editPage() (the GET routes that render the actual form pages): a plain
 * JSON 403 on a hard navigation would be a broken, non-Inertia response
 * (the same class of bug @nyalajs/inertia's InertiaResponse.render() had
 * before this session's X-Inertia header fix), not a clean "log in"
 * experience. Those two check `req.session?.get("isAdmin")` by hand
 * instead and issue a real 303 redirect to /admin/login — same "check
 * inside the handler" escape hatch this guard's SessionAuthGuard
 * counterpart's own doc comment already prescribes.
 */
@Injectable()
export class AdminGuard implements Guard {
    canActivate(context: ExecutionContext): boolean {
        return context.request.session?.get("isAdmin") === true;
    }
}
