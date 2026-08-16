import * as fs from "fs";
import * as path from "path";
import { db, closeConnection } from "./connection";
import { sql } from "drizzle-orm";

/**
 * Standalone SQLite migration runner — run directly via `tsx
 * database/migrate.ts` (see package.json's `db:migrate` script), NOT
 * `nyala db:migrate`. packages/cli/runtime/migration-runner.ts is
 * hardcoded to Postgres (the `postgres` package + a `postgres://`
 * connection string — see its own doc comment), and this starter
 * deliberately uses SQLite/better-sqlite3 instead (see
 * database/connection.ts's "Why SQLite" comment) so it runs with zero
 * external services. Tracks applied migrations in `_nyala_migrations`,
 * same convention as the Postgres runner, just against SQLite's dialect.
 */
async function main(): Promise<void> {
    const migrationsDir = path.join(__dirname, "migrations");

    db.run(sql`
        CREATE TABLE IF NOT EXISTS _nyala_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            executed_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);

    const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".ts"))
        .sort();

    const appliedRows = db.all<{ name: string }>(sql`SELECT name FROM _nyala_migrations`);
    const applied = new Set(appliedRows.map((r) => r.name));
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
        console.log("No pending migrations.");
    }

    for (const file of pending) {
        const mod = await import(path.join(migrationsDir, file));
        const up = mod.up ?? mod.default?.up;
        if (typeof up !== "function") {
            throw new Error(`Migration ${file} has no exported up(db) function`);
        }
        await up(db);
        db.run(sql`INSERT INTO _nyala_migrations (name) VALUES (${file})`);
        console.log(`✓ Applied migration: ${file}`);
    }

    closeConnection();
}

main().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
});
