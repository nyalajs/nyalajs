/**
 * Reads the logged-in user's id/name/email straight off the session (set at
 * login/register — see app/controllers/auth.controller.ts) instead of a DB
 * round trip on every page load. Returns null when no one is logged in, so
 * callers can pass it straight through as the `user` shared prop (see
 * bootstrap/main.ts's InertiaShareMiddleware wiring) — pages read
 * `usePage().props.user` to decide what nav/actions to show.
 */
export function currentUser(req: any): { id: string; name: string; email: string } | null {
    const userId = req.session?.get("userId");
    if (!userId) return null;

    return {
        id: userId,
        name: req.session?.get("name") ?? "",
        email: req.session?.get("email") ?? "",
    };
}
