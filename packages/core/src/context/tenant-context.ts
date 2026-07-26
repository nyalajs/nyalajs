import { AsyncLocalStorage } from "async_hooks";

interface TenantStore {
    tenantId?: string;
}

/**
 * Request-scoped tenant id, propagated via AsyncLocalStorage so that code
 * with no access to the request/ExecutionContext — most notably the static
 * `Model` methods in @nyalajs/database — can still read the current tenant.
 */
export class TenantContext {
    private static readonly als = new AsyncLocalStorage<TenantStore>();

    static run<T>(fn: () => T): T {
        return this.als.run({}, fn);
    }

    static set(tenantId: string | undefined): void {
        const store = this.als.getStore();
        if (store) {
            store.tenantId = tenantId;
        }
    }

    static get(): string | undefined {
        return this.als.getStore()?.tenantId;
    }
}
