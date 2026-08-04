/**
 * Tenant Helper
 *
 * Utility functions for tenant-related operations.
 */

/**
 * Generate a slug from a name
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Validate slug format
 */
export function isValidSlug(slug: string): boolean {
    return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Extract tenant slug from subdomain
 * @example extractTenantSlug("acme.example.com") => "acme"
 */
export function extractTenantSlug(hostname: string): string | null {
    const parts = hostname.split(".");

    // Minimum 3 parts for subdomain (subdomain.domain.tld)
    if (parts.length < 3) {
        return null;
    }

    // First part is the tenant slug
    const slug = parts[0];

    // Exclude common subdomains
    if (["www", "api", "app", "admin"].includes(slug)) {
        return null;
    }

    return isValidSlug(slug) ? slug : null;
}

/**
 * Get tenant from header or token
 */
export function extractTenantFromHeader(header: string | undefined): string | null {
    if (!header) return null;

    const slug = header.trim();
    return isValidSlug(slug) ? slug : null;
}
