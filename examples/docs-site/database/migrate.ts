import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { db, closeConnection } from "./connection";
import { sql } from "drizzle-orm";

/**
 * Standalone MySQL migration runner — run directly via `tsx
 * database/migrate.ts` (see package.json's `db:migrate` script), NOT
 * `nyala db:migrate`. packages/cli/runtime/migration-runner.ts is
 * hardcoded to Postgres (the `postgres` package + a `postgres://`
 * connection string — see its own doc comment), and this app connects to
 * MySQL directly via mysql2/drizzle-orm/mysql2 instead. Tracks applied
 * migrations in `_nyala_migrations`, same convention as the Postgres
 * runner, just against MySQL's dialect and async driver (db.execute(),
 * not better-sqlite3's synchronous db.run()/db.all()).
 */
async function main(): Promise<void> {
    const migrationsDir = path.join(__dirname, "migrations");

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS _nyala_migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".ts"))
        .sort();

    const [appliedRows] = await db.execute<{ name: string }>(sql`SELECT name FROM _nyala_migrations`);
    const applied = new Set((appliedRows as unknown as { name: string }[]).map((r) => r.name));
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
        await db.execute(sql`INSERT INTO _nyala_migrations (name) VALUES (${file})`);
        console.log(`✓ Applied migration: ${file}`);
    }

    await closeConnection();
}

main().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
});
