import { Injectable } from "@nyalajs/core";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
// @ts-ignore
import { Pool } from "pg";
import { TransactionContext } from "./transaction-context";

export interface DatabaseConfig {
    connectionString: string;
    maxConnections?: number;
}

@Injectable()
export class DatabaseService {
    private pool: Pool | null = null;
    public db: NodePgDatabase | null = null;

    connect(config: DatabaseConfig): void {
        this.pool = new Pool({
            connectionString: config.connectionString,
            max: config.maxConnections ?? 10,
        });
        this.db = drizzle(this.pool);
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
        }
    }

    getDb(): NodePgDatabase {
        if (!this.db) {
            throw new Error("Database not connected. Call connect() first.");
        }
        return this.db;
    }

    /**
     * Runs `fn` inside a real database transaction — thrown errors trigger a
     * rollback (native Drizzle/pg behavior). Any `Model` call made inside
     * `fn` (e.g. `await User.create(...)`, `await Order.save()`) transparently
     * participates in the same transaction via TransactionContext, so
     * multi-model writes are atomic with no call-site changes.
     */
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
        const db = this.getDb();
        return db.transaction((tx) => TransactionContext.run(tx as unknown as NodePgDatabase, fn));
    }
}
