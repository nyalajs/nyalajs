import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { ConnectionContext } from "@nyalajs/database";
import { TenantRegistry } from "@nyalajs/tenancy";

/**
 * Runs `fn` against the RIGHT database for a specific, already-known tenant
 * — the tenant's own dedicated connection if it's been migrated (see
 * TenantsService.migrateToDedicated()), or just `fn()` directly (the
 * shared connection, the default Model.connection() fallback) otherwise.
 *
 * For use in flows that discover WHICH tenant they're operating on partway
 * through — after TenantMiddleware has already run and decided NOT to
 * route this request anywhere (because there was no tenant identity yet
 * to route by): login (the tenant is resolved from the request body/
 * subdomain, not a JWT), refresh-token exchange (resolved from the
 * refresh token's own payload), accept-invite (resolved from the invite
 * token). Every one of these needs the rest of its own logic — reading
 * the real user row, writing lastLoginAt, issuing tokens, etc. — to
 * target that SAME tenant's real database once it's known, exactly like
 * TenantMiddleware would have done had it had the chance to route this
 * request in the first place.
 *
 * Confirmed against a real dedicated tenant: login for a user that
 * genuinely existed (with the correct password) failed with "Invalid
 * credentials" without this — the user lookup silently checked the SHARED
 * database instead of the dedicated one the user's row actually lived on.
 */
export async function runForTenant<T>(tenantRegistry: TenantRegistry, tenantId: string, fn: () => Promise<T>): Promise<T> {
    const record = await tenantRegistry.find(tenantId);

    if (record?.isolationMode === "dedicated" && record.connectionString) {
        const client = postgres(record.connectionString, { max: 1 });
        try {
            const dedicatedDb = drizzle(client);
            return await ConnectionContext.run(dedicatedDb, fn);
        } finally {
            await client.end();
        }
    }

    return fn();
}
