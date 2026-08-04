import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/** The SQL dialect a connected database speaks. Drives schema/query codegen in SchemaRegistry and Model. */
export type DatabaseDialect = "postgres" | "mysql" | "sqlite";

/** The concrete driver package used to open the connection. */
export type DatabaseDriver = "pg" | "postgres" | "mysql2" | "better-sqlite3";

/** Any Drizzle database instance this package can operate against. */
export type AnyDatabase =
    | NodePgDatabase
    | PostgresJsDatabase
    | MySql2Database
    | BetterSQLite3Database;

export const DRIVER_DIALECTS: Record<DatabaseDriver, DatabaseDialect> = {
    pg: "postgres",
    postgres: "postgres",
    mysql2: "mysql",
    "better-sqlite3": "sqlite",
};
