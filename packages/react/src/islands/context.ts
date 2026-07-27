import { AsyncLocalStorage } from "async_hooks";

/**
 * Tracks which islands were used during a single ViewResponse.render() call,
 * so the page can conditionally include the hydration bootstrap script only
 * when it's actually needed — a view with no islands ships zero JS.
 *
 * Same AsyncLocalStorage-per-scope shape as TenantContext (@nyalajs/core)
 * and TransactionContext (@nyalajs/database).
 */
export class IslandTrackingContext {
    private static readonly als = new AsyncLocalStorage<Set<string>>();

    static run<T>(fn: () => T): T {
        return this.als.run(new Set(), fn);
    }

    static record(name: string): void {
        this.als.getStore()?.add(name);
    }

    static get used(): string[] {
        return Array.from(this.als.getStore() ?? []);
    }
}
