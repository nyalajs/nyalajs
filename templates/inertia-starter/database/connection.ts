import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/models";

/**
 * Database Connection
 *
 * better-sqlite3 by default — a single on-disk file (or ":memory:"),
 * chosen so this starter runs with zero external services (see README.md's
 * "Why SQLite" section for the full reasoning, including why `nyala
 * db:migrate`/`nyala db:seed` — which are hardcoded to Postgres today, see
 * packages/cli/runtime/migration-runner.ts — aren't used here; this
 * starter runs database/migrate.ts / database/seed.ts directly instead).
 * Swap this file + config/database.ts for postgres/pg/mysql2 to match
 * templates/basic-starter's setup for a real deployment.
 */

const dbPath = process.env.DB_PATH || "./storage/database.sqlite";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function closeConnection(): void {
    sqlite.close();
}
