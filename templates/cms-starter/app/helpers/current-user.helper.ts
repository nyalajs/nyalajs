/**
 * Reads the logged-in admin user's display info straight from the session
 * (set at login — see AdminAuthController) instead of a DB round trip on
 * every admin page load.
 */
export function currentUser(req: any): { name: string; role: string } {
    return {
        name: req.session?.get("name") ?? "Admin",
        role: req.session?.get("role") ?? "viewer",
    };
}
