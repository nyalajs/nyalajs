import { Injectable } from "@nyala/core";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
// @ts-ignore
import { Pool } from "pg";

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
}
