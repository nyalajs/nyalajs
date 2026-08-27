import { AnyDatabase, DatabaseDialect, DatabaseDriver, DRIVER_DIALECTS } from "./dialect";

export interface OpenConnectionConfig {
    /** Which driver to connect with. Defaults to "pg" (node-postgres). */
    driver?: DatabaseDriver;
    /**
     * Connection string for pg/postgres/mysql2. For better-sqlite3 this is
     * the database file path (use ":memory:" for an in-memory database).
     */
    connectionString: string;
    /** Ignored for better-sqlite3, which has no connection pool. */
    maxConnections?: number;
}

export interface OpenedConnection {
    db: AnyDatabase;
    dialect: DatabaseDialect;
    close: () => Promise<void>;
}

const DRIVER_INSTALL_HINT: Record<DatabaseDriver, string> = {
    pg: "npm install pg",
    postgres: "npm install postgres",
    mysql2: "npm install mysql2",
    "better-sqlite3": "npm install better-sqlite3",
};

async function importDriver(moduleName: string, driver: DatabaseDriver): Promise<any> {
    try {
        return await import(moduleName);
    } catch {
        throw new Error(
            `[nyala/database] driver "${driver}" requires the optional peer dependency "${moduleName.split("/")[0]}". ` +
            `Run: ${DRIVER_INSTALL_HINT[driver]}`
        );
    }
}

/**
 * Opens one real database connection for any of the four supported drivers
 * and returns it as a plain, disposable value — no static/global state
 * touched (`SchemaRegistry.setDialect()` is NOT called here, unlike
 * `DatabaseService.connect()`, since that's process-global and this
 * function may be opening one of many concurrent connections, e.g. one per
 * dedicated-tenant database, that must NOT stomp on each other's dialect).
 *
 * `DatabaseService.connect()` is a thin wrapper around this for the single
 * "main" application connection; `TenantConnectionManager` calls this
 * directly for every dedicated-tenant connection it opens, so both paths
 * share one real, tested driver-connect implementation instead of two.
 */
export async function openConnection(config: OpenConnectionConfig): Promise<OpenedConnection> {
    const driver = config.driver ?? "pg";
    const dialect = DRIVER_DIALECTS[driver];

    switch (driver) {
        case "pg": {
            const pg = await importDriver("pg", driver);
            const { drizzle } = await import("drizzle-orm/node-postgres");
            const pool = new pg.Pool({
                connectionString: config.connectionString,
                max: config.maxConnections ?? 10,
            });
            pool.on("error", (err: Error) => {
                console.error("[nyala/database] Unexpected error on idle Postgres client:", err);
            });
            return { db: drizzle(pool), dialect, close: () => pool.end() };
        }
        case "postgres": {
            const postgres = (await importDriver("postgres", driver)).default;
            const { drizzle } = await import("drizzle-orm/postgres-js");
            const client = postgres(config.connectionString, {
                max: config.maxConnections ?? 10,
            });
            return { db: drizzle(client), dialect, close: () => client.end() };
        }
        case "mysql2": {
            const mysql = await importDriver("mysql2/promise", driver);
            const { drizzle } = await import("drizzle-orm/mysql2");
            const pool = mysql.createPool({
                uri: config.connectionString,
                connectionLimit: config.maxConnections ?? 10,
            });
            pool.on("error", (err: Error) => {
                console.error("[nyala/database] Unexpected error on idle MySQL client:", err);
            });
            return { db: drizzle(pool), dialect, close: () => pool.end() };
        }
        case "better-sqlite3": {
            const Database = (await importDriver("better-sqlite3", driver)).default;
            const { drizzle } = await import("drizzle-orm/better-sqlite3");
            const client = new Database(config.connectionString);
            return { db: drizzle(client), dialect, close: async () => client.close() };
        }
    }
}
