import { Injectable } from "@nyalajs/core";
import { TransactionContext } from "./transaction-context";
import { SchemaRegistry } from "./schema/registry";
import { AnyDatabase, DatabaseDialect, DatabaseDriver, DRIVER_DIALECTS } from "./dialect";

export interface DatabaseConfig {
    /**
     * Which driver to connect with. Defaults to "pg" (node-postgres), matching
     * this package's original Postgres-only behavior.
     */
    driver?: DatabaseDriver;
    /**
     * Connection string for pg/postgres/mysql2. For better-sqlite3 this is the
     * database file path (use ":memory:" for an in-memory database).
     */
    connectionString: string;
    /** Ignored for better-sqlite3, which has no connection pool. */
    maxConnections?: number;
}

const DRIVER_INSTALL_HINT: Record<DatabaseDriver, string> = {
    pg: "npm install pg",
    postgres: "npm install postgres",
    mysql2: "npm install mysql2",
    "better-sqlite3": "npm install better-sqlite3",
};

@Injectable()
export class DatabaseService {
    private closeHandle: (() => Promise<void> | void) | null = null;
    private dialect: DatabaseDialect = "postgres";
    public db: AnyDatabase | null = null;

    async connect(config: DatabaseConfig): Promise<void> {
        const driver = config.driver ?? "pg";
        this.dialect = DRIVER_DIALECTS[driver];
        SchemaRegistry.setDialect(this.dialect);

        switch (driver) {
            case "pg": {
                const pg = await this.importDriver("pg", driver);
                const { drizzle } = await import("drizzle-orm/node-postgres");
                const pool = new pg.Pool({
                    connectionString: config.connectionString,
                    max: config.maxConnections ?? 10,
                });
                // Without this, a background/idle client error (e.g. a dropped
                // connection) is an unhandled 'error' event, which Node treats
                // as an uncaught exception and crashes the process.
                pool.on("error", (err: Error) => {
                    console.error("[nyala/database] Unexpected error on idle Postgres client:", err);
                });
                this.db = drizzle(pool);
                this.closeHandle = () => pool.end();
                break;
            }
            case "postgres": {
                const postgres = (await this.importDriver("postgres", driver)).default;
                const { drizzle } = await import("drizzle-orm/postgres-js");
                const client = postgres(config.connectionString, {
                    max: config.maxConnections ?? 10,
                });
                this.db = drizzle(client);
                this.closeHandle = () => client.end();
                break;
            }
            case "mysql2": {
                const mysql = await this.importDriver("mysql2/promise", driver);
                const { drizzle } = await import("drizzle-orm/mysql2");
                const pool = mysql.createPool({
                    uri: config.connectionString,
                    connectionLimit: config.maxConnections ?? 10,
                });
                pool.on("error", (err: Error) => {
                    console.error("[nyala/database] Unexpected error on idle MySQL client:", err);
                });
                this.db = drizzle(pool);
                this.closeHandle = () => pool.end();
                break;
            }
            case "better-sqlite3": {
                const Database = (await this.importDriver("better-sqlite3", driver)).default;
                const { drizzle } = await import("drizzle-orm/better-sqlite3");
                const client = new Database(config.connectionString);
                this.db = drizzle(client);
                this.closeHandle = () => client.close();
                break;
            }
        }
    }

    private async importDriver(moduleName: string, driver: DatabaseDriver): Promise<any> {
        try {
            return await import(moduleName);
        } catch {
            throw new Error(
                `[nyala/database] driver "${driver}" requires the optional peer dependency "${moduleName.split("/")[0]}". ` +
                `Run: ${DRIVER_INSTALL_HINT[driver]}`
            );
        }
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
