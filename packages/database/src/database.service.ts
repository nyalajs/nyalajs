import { Injectable } from "@nyalajs/core";
import { TransactionContext } from "./transaction-context";
import { SchemaRegistry } from "./schema/registry";
import { AnyDatabase, DatabaseDialect } from "./dialect";
import { openConnection, OpenConnectionConfig } from "./open-connection";

export interface DatabaseConfig extends OpenConnectionConfig {}

@Injectable()
export class DatabaseService {
    private closeHandle: (() => Promise<void> | void) | null = null;
    private dialect: DatabaseDialect = "postgres";
    public db: AnyDatabase | null = null;

    async connect(config: DatabaseConfig): Promise<void> {
        const opened = await openConnection(config);
        this.dialect = opened.dialect;
        // Process-global — deliberately NOT done by openConnection() itself,
        // since that function is also used to open per-tenant dedicated
        // connections (TenantConnectionManager), which must never affect the
        // schema-building dialect used for the main/shared connection.
        SchemaRegistry.setDialect(this.dialect);
        this.db = opened.db;
        this.closeHandle = opened.close;
    }

    async disconnect(): Promise<void> {
        if (this.closeHandle) {
            await this.closeHandle();
        }
    }

    getDb(): AnyDatabase {
        if (!this.db) {
            throw new Error("Database not connected. Call connect() first.");
        }
        return this.db;
    }

    getDialect(): DatabaseDialect {
        return this.dialect;
    }

    /**
     * Runs `fn` inside a real database transaction — thrown errors trigger a
     * rollback. Any `Model` call made inside `fn` (e.g. `await User.create(...)`,
     * `await Order.save()`) transparently participates in the same transaction
     * via TransactionContext, so multi-model writes are atomic with no
     * call-site changes.
     */
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
        const db = this.getDb();

        if (this.dialect === "sqlite") {
            // better-sqlite3's own db.transaction() wrapper requires a
            // *synchronous* callback — better-sqlite3 executes queries
            // synchronously under the hood, so if we handed it our async `fn`
            // directly, it would treat the pending Promise `fn()` returns as
            // the final result and commit immediately, before any of the
            // awaited work inside actually ran. Driving BEGIN/COMMIT/ROLLBACK
            // by hand keeps the same async `fn` contract correct across all
            // four drivers.
            const sqliteDb = db as any;
            sqliteDb.run("BEGIN");
            try {
                const result = await TransactionContext.run(db, fn);
                sqliteDb.run("COMMIT");
                return result;
            } catch (error) {
                sqliteDb.run("ROLLBACK");
                throw error;
            }
        }

        return (db as any).transaction((tx: AnyDatabase) => TransactionContext.run(tx, fn));
    }
}
