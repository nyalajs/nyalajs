import { TransactionContext } from "@nyalajs/database";
import { db } from "./connection";

/**
 * Runs `fn` inside a real Postgres transaction — thrown errors trigger a
 * rollback. Any `Model` call made inside `fn` (e.g. `await User.create(...)`,
 * `await Tenant.save()`) transparently participates in the same
 * transaction via `TransactionContext` (Model.connection() checks it FIRST,
 * before ConnectionContext or the global pool — see Model's own doc
 * comment), so multi-model writes stay atomic with no call-site changes.
 *
 * Equivalent to @nyalajs/database's own `DatabaseService.transaction()`,
 * reimplemented directly against this app's own `db` (from ./connection)
 * rather than introducing a second, separately-`.connect()`-ed
 * DatabaseService instance — this app already manages its own single
 * connection/Model.setDatabase() wiring in bootstrap/main.ts.
 */
export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return db.transaction((tx: any) => TransactionContext.run(tx, fn));
}
