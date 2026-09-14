import postgres from "postgres";
import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { TenantRecord } from "@nyalajs/tenancy";

/**
 * Finds a pre-auth token (email verification, password reset, team invite)
 * across EVERY database this app might have it in — not just the shared
 * one.
 *
 * Why this exists: accept-invite/verify-email/reset-password all run with
 * NO tenant identity resolved yet (that's the whole point — the token
 * itself is what identifies the tenant, there's no JWT/subdomain for
 * TenantMiddleware to route by). Once ANY tenant has been migrated to a
 * dedicated database (see TenantsService.migrateToDedicated()), a lookup
 * that only checks the shared database silently misses every token
 * belonging to a dedicated tenant's users — reproduced against a real
 * migrated tenant: accept-invite for a token that undeniably existed
 * returned "invalid or expired" because the row lived on the tenant's own
 * dedicated database, never the shared one.
 *
 * Checks the shared database first (the fast, common-case path — most
 * tenants stay shared forever), then falls back to querying every
 * registered DEDICATED tenant's own database in turn, via `lookup` run
 * against a real Drizzle instance opened for that tenant's own connection
 * string (closed again immediately after, whether or not it found
 * anything — this is a one-shot check, not a connection this app keeps
 * around, unlike TenantConnectionManager's pooled dedicated-tenant
 * connections for live request traffic).
 *
 * This is real, unavoidable extra latency/fan-out proportional to how many
 * dedicated tenants exist — acceptable for a starter kit's correctness,
 * but the doc comment on TenantsService.migrateToDedicated() is honest
 * that this doesn't scale indefinitely: an app with hundreds of dedicated
 * tenants would want a real routing index (e.g. a token-prefix-to-tenant
 * map) instead of fanning out to every one of them per pre-auth request.
 */
export async function findAcrossAllDatabases<T>(
    sharedLookup: () => Promise<T | null>,
    lookup: (db: PostgresJsDatabase) => Promise<T | null>
): Promise<T | null> {
    const sharedResult = await sharedLookup();
    if (sharedResult) return sharedResult;

    const dedicatedTenants = await TenantRecord.query().where("isolationMode", "dedicated").get();

    for (const record of dedicatedTenants) {
        if (!record.connectionString) continue;

        const client = postgres(record.connectionString, { max: 1 });
        try {
            const dedicatedDb = drizzle(client);
            const result = await lookup(dedicatedDb);
            if (result) return result;
        } finally {
            await client.end();
        }
    }

    return null;
}
