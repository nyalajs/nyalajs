import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../app/models";

/**
 * Database Connection
 *
 * better-sqlite3, same as templates/inertia-starter/database/connection.ts
 * — a single on-disk file, zero external services to run this. `nyala
 * db:migrate`/`nyala db:seed` are hardcoded to Postgres (see
 * packages/cli/runtime/migration-runner.ts), so this app runs
 * database/migrate.ts / database/seed.ts directly instead (see those
 * files and package.json's db:migrate/db:seed scripts).
 */

const dbPath = process.env.DB_PATH || "./storage/database.sqlite";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function closeConnection(): void {
    sqlite.close();
}
