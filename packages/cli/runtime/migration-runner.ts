/**
 * Executed via `npx tsx` from the target project's directory (not compiled
 * by the CLI's own tsc build) so it can load the project's `.ts` migration
 * stubs directly, using the project's own tsconfig/node_modules.
 *
 * Reads its instructions from env vars set by MigrateCommand:
 *   NYALA_MIGRATE_ACTION            "up" | "down"
 *   NYALA_DB_CONNECTION_STRING      Postgres connection string
 *   NYALA_MIGRATIONS_DIR            absolute path to database/migrations
 *
 * Tracks applied migrations in a `_nyala_migrations` table so `up` only runs
 * pending files and `down` only rolls back what this runner itself applied.
 *
 * Uses the `postgres` package (not `pg`) because that's the driver every
 * starter template actually installs — see database/connection.ts.
 */
import * as path from "path";
import * as fs from "fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

async function main(): Promise<void> {
    const action = process.env.NYALA_MIGRATE_ACTION;
    const migrationsDir = process.env.NYALA_MIGRATIONS_DIR;
    const connectionString = process.env.NYALA_DB_CONNECTION_STRING;

    if (!migrationsDir || !connectionString) {
        throw new Error("migration-runner requires NYALA_MIGRATIONS_DIR and NYALA_DB_CONNECTION_STRING");
    }

    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client);

    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS _nyala_migrations (
            id serial PRIMARY KEY,
            name text UNIQUE NOT NULL,
            executed_at timestamptz NOT NULL DEFAULT now()
        )
    `);

    const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
        .sort();

    if (action === "up") {
        const rows = await client.unsafe("SELECT name FROM _nyala_migrations");
        const applied = new Set(rows.map((r: any) => r.name));
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
            console.log(`Applying ${file}...`);
            await up(db);
            await client.unsafe("INSERT INTO _nyala_migrations (name) VALUES ($1)", [file]);
        }
    } else if (action === "down") {
        const rows = await client.unsafe(
            "SELECT name FROM _nyala_migrations ORDER BY id DESC LIMIT 1"
        );

        if (rows.length === 0) {
            console.log("No migrations to roll back.");
        } else {
            const name = rows[0].name;
            const mod = await import(path.join(migrationsDir, name));
            const down = mod.down ?? mod.default?.down;
            if (typeof down !== "function") {
                throw new Error(`Migration ${name} has no exported down(db) function`);
            }
            console.log(`Rolling back ${name}...`);
            await down(db);
            await client.unsafe("DELETE FROM _nyala_migrations WHERE name = $1", [name]);
        }
    } else {
        throw new Error(`Unknown NYALA_MIGRATE_ACTION: ${action}`);
    }

    await client.end();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
