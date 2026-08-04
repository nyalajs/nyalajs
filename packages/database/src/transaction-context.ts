import { AsyncLocalStorage } from "async_hooks";
import { AnyDatabase } from "./dialect";

/**
 * Propagates the active transaction handle via AsyncLocalStorage so static
 * `Model` calls made inside `DatabaseService.transaction(fn)` transparently
 * run against the transaction instead of the global connection — no
 * call-site changes needed.
 */
export class TransactionContext {
    private static readonly als = new AsyncLocalStorage<AnyDatabase>();

    static run<T>(tx: AnyDatabase, fn: () => Promise<T>): Promise<T> {
        return this.als.run(tx, fn);
    }

    static get(): AnyDatabase | undefined {
        return this.als.getStore();
    }
}
