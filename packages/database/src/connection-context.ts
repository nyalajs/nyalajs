import { AsyncLocalStorage } from "async_hooks";
import { AnyDatabase } from "./dialect";

/**
 * Propagates a request-scoped, non-default database connection via
 * AsyncLocalStorage — the mechanism a dedicated-per-tenant database uses to
 * make every static `Model` call for the rest of the request transparently
 * run against that tenant's own connection instead of the shared global
 * pool, with zero call-site changes (same pattern TransactionContext already
 * uses for `DatabaseService.transaction()`).
 *
 * Populated by `@nyalajs/tenancy`'s TenantMiddleware once it has resolved
 * both the current tenant AND that tenant's isolation mode: for a
 * "dedicated" tenant it looks up (or lazily opens) that tenant's connection
 * via TenantConnectionManager and runs the rest of the request inside
 * `ConnectionContext.run(tenantDb, next)`. For a "shared" tenant (or when
 * tenancy isn't in use at all) this is never populated, and `Model` falls
 * back to its normal global connection exactly as before — fully backward
 * compatible.
 *
 * Precedence in `Model.connection()`: an open transaction always wins (a
 * transaction started via `DatabaseService.transaction()` inside a
 * dedicated-tenant request must run on that SAME connection, not silently
 * re-target the shared pool), then ConnectionContext, then the global
 * static default.
 */
export class ConnectionContext {
    private static readonly als = new AsyncLocalStorage<AnyDatabase>();

    static run<T>(db: AnyDatabase, fn: () => Promise<T>): Promise<T> {
        return this.als.run(db, fn);
    }

    static get(): AnyDatabase | undefined {
        return this.als.getStore();
    }
}
