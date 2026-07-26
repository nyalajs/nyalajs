import { AsyncLocalStorage } from "async_hooks";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Propagates the active transaction handle via AsyncLocalStorage so static
 * `Model` calls made inside `DatabaseService.transaction(fn)` transparently
 * run against the transaction instead of the global connection — no
 * call-site changes needed.
 */
export class TransactionContext {
    private static readonly als = new AsyncLocalStorage<NodePgDatabase>();

    static run<T>(tx: NodePgDatabase, fn: () => Promise<T>): Promise<T> {
        return this.als.run(tx, fn);
    }

    static get(): NodePgDatabase | undefined {
        return this.als.getStore();
    }
}
