import { AsyncLocalStorage } from "async_hooks";

export interface LogContextStore {
    requestId?: string;
    traceId?: string;
    tenantId?: string;
    userId?: string;
}

/**
 * Request-scoped correlation IDs, propagated via AsyncLocalStorage so
 * @nyalajs/observability's Logger can attach them to every log call
 * automatically — no need to thread a child logger through every function
 * that wants to log something. Mirrors TenantContext's shape/lifecycle;
 * FastifyAdapter populates both from the same per-request scope.
 */
export class LogContext {
    private static readonly als = new AsyncLocalStorage<LogContextStore>();

    static run<T>(store: LogContextStore, fn: () => T): T {
        return this.als.run(store, fn);
    }

    static set(patch: Partial<LogContextStore>): void {
        const store = this.als.getStore();
        if (store) {
            Object.assign(store, patch);
        }
    }

    static get(): LogContextStore {
        return this.als.getStore() ?? {};
    }
}
