import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../app/models";

/**
 * Database Connection — MySQL (mysql2), same real
 * mysql.createPool({ uri }) + drizzle(pool) pattern
 * @nyalajs/database's own DatabaseService uses for its "mysql2" driver
 * (packages/database/src/database.service.ts) — this app doesn't use
 * DatabaseService itself (same reasoning as inertia-starter's SQLite
 * setup: one direct Drizzle connection is simpler for a single-model
 * app), just the same real driver/config shape.
 */

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL || buildUriFromParts(),
    connectionLimit: 10,
});

function buildUriFromParts(): string {
    const host = process.env.DB_HOST || "127.0.0.1";
    const port = process.env.DB_PORT || "3306";
    const user = process.env.DB_USER || "root";
    const password = process.env.DB_PASSWORD || "";
    const database = process.env.DB_NAME || "nyaladocs";
    return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

// mysql2/promise's Pool type only declares 'connection'/'acquire'/'release'/
// 'enqueue' event overloads (verified against its real .d.ts) — no 'error',
// unlike the plain callback-style mysql2 API @nyalajs/database's own
// DatabaseService uses. Nothing here to listen for without dropping to an
// untyped `(pool as any).on(...)`, which isn't worth it for logging alone.

export const db = drizzle(pool, { schema, mode: "default" });

export async function closeConnection(): Promise<void> {
    await pool.end();
}
