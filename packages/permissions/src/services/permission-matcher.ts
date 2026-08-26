/**
 * Wildcard permission matching — a feature base Spatie laravel-permission
 * does NOT have (their separate spatie/laravel-permission wildcard add-on
 * covers similar ground, but it's a different package with its own model).
 * Here it's built in: a permission named "posts.*" matches a check for
 * "posts.create", "posts.edit", "posts.delete", etc. A bare "*" matches
 * everything (the conventional super-admin-permission shape, distinct from
 * the role-based super-admin bypass — see SuperAdminGuard).
 *
 * Matching is segment-based on "." (dot), not a general glob/regex engine:
 * "posts.*" matches "posts.create" and "posts.comments.delete" (a "*"
 * segment matches one or more trailing segments), but "posts.*.delete"
 * (a "*" in the MIDDLE) is intentionally not supported — keeping the
 * semantics simple and predictable (a trailing wildcard only) matters more
 * here than glob completeness, since this runs on every permission check.
 */
export function matchesPermission(granted: string, required: string): boolean {
    if (granted === required) return true;
    if (granted === "*") return true;

    if (granted.endsWith(".*")) {
        const prefix = granted.slice(0, -2); // strip trailing ".*"
        return required === prefix || required.startsWith(prefix + ".");
    }

    return false;
}

/** True if `required` is matched by ANY entry in `granted` (wildcard-aware). */
export function anyMatchesPermission(granted: Iterable<string>, required: string): boolean {
    for (const g of granted) {
        if (matchesPermission(g, required)) return true;
    }
    return false;
}
