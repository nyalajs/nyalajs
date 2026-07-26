import * as path from "path";
import * as fs from "fs-extra";
import ora from "ora";
import chalk from "chalk";
import * as dotenv from "dotenv";
import { spawnSync } from "child_process";

/**
 * Migration runner. `nyala generate migration <name>` scaffolds a
 * `up(db)/down(db)` TS stub; this command executes those stubs directly
 * (tracked in a `_nyala_migrations` table) rather than relying on
 * drizzle-kit's SQL-file migrator, which expects a different artifact
 * format entirely. The actual file loading happens in a small script
 * (runtime/migration-runner.ts) run via `npx tsx` in the project's own
 * directory, so it can load the project's `.ts` migration files using the
 * project's own tsconfig/node_modules.
 */
export class MigrateCommand {
    async handle(options: { fresh?: boolean; seed?: boolean } = {}): Promise<void> {
        dotenv.config({ path: path.join(process.cwd(), ".env") });

        const spinner = ora("Running database migrations").start();
        const migrationsDir = path.join(process.cwd(), "database/migrations");

        if (!(await fs.pathExists(migrationsDir))) {
            spinner.info("No migrations directory found. Run `nyala generate migration <name>` first.");
            return;
        }

        const connectionString = this.buildConnectionString();
        if (!connectionString) {
            spinner.fail(
                "No database connection string found.\n" +
                "  Set DB_URL or (DB_HOST + DB_PORT + DB_NAME + DB_USER + DB_PASSWORD) in your .env file."
            );
            return;
        }

        spinner.text = "Applying pending migrations...";

        const result = this.runMigrationScript("up", migrationsDir, connectionString);

        if (result.status !== 0) {
            spinner.fail("Migration failed");
            process.exit(result.status ?? 1);
        }

        spinner.succeed(chalk.green("Migrations up to date."));

        if (options.seed) {
            await this.runSeeders();
        }
    }

    async rollback(): Promise<void> {
        dotenv.config({ path: path.join(process.cwd(), ".env") });

        const spinner = ora("Rolling back the last migration").start();
        const migrationsDir = path.join(process.cwd(), "database/migrations");

        if (!(await fs.pathExists(migrationsDir))) {
            spinner.info("No migrations directory found.");
            return;
        }

        const connectionString = this.buildConnectionString();
        if (!connectionString) {
            spinner.fail("No database connection string found.");
            return;
        }

        const result = this.runMigrationScript("down", migrationsDir, connectionString);

        if (result.status !== 0) {
            spinner.fail("Rollback failed");
            process.exit(result.status ?? 1);
        }

        spinner.succeed(chalk.green("Rollback complete."));
    }

    async fresh(): Promise<void> {
        const spinner = ora("Dropping and recreating the schema...").start();
        dotenv.config({ path: path.join(process.cwd(), ".env") });

        const connectionString = this.buildConnectionString();
        if (!connectionString) {
            spinner.fail("No database connection string found.");
            return;
        }

        let Pool: any;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            ({ Pool } = require("pg"));
        } catch {
            spinner.fail("pg not installed. Run: npm install pg");
            return;
        }

        const pool = new Pool({ connectionString });
        try {
            await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
            await pool.end();
            spinner.succeed("Schema dropped and recreated.");
            await this.handle();
        } catch (e: any) {
            await pool.end().catch(() => {});
            spinner.fail("Fresh migration failed: " + (e?.message ?? e));
            process.exit(1);
        }
    }

    /**
     * Runs runtime/migration-runner.ts via `npx tsx` from the project's own
     * directory, so it resolves the project's tsconfig/node_modules (pg,
     * drizzle-orm) rather than the CLI's own.
     */
    private runMigrationScript(
        action: "up" | "down",
        migrationsDir: string,
        connectionString: string
    ): { status: number | null } {
        const runnerPath = path.join(__dirname, "../../runtime/migration-runner.ts");

        return spawnSync("npx", ["tsx", runnerPath], {
            stdio: "inherit",
            cwd: process.cwd(),
            env: {
                ...process.env,
                NYALA_MIGRATE_ACTION: action,
                NYALA_MIGRATIONS_DIR: migrationsDir,
                NYALA_DB_CONNECTION_STRING: connectionString,
            },
        });
    }

    private async runSeeders(): Promise<void> {
        const seedersDir = path.join(process.cwd(), "database/seeders");
        if (!(await fs.pathExists(seedersDir))) return;

        const files = (await fs.readdir(seedersDir))
            .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
            .sort();

        if (files.length === 0) return;

        console.log(chalk.cyan("\nRunning seeders..."));
        for (const file of files) {
            const seeder = await import(path.join(seedersDir, file));
            if (typeof seeder.default?.run === "function") {
                await seeder.default.run();
                console.log(chalk.green("  Seeded: ") + file);
            } else if (typeof seeder.run === "function") {
                await seeder.run();
                console.log(chalk.green("  Seeded: ") + file);
            }
        }
    }

    private buildConnectionString(): string | null {
        if (process.env.DB_URL) return process.env.DB_URL;
        if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

        const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
        if (DB_HOST && DB_NAME && DB_USER) {
            const pass = DB_PASSWORD ? encodeURIComponent(DB_PASSWORD) : "";
            const port = DB_PORT || "5432";
            return `postgresql://${DB_USER}:${pass}@${DB_HOST}:${port}/${DB_NAME}`;
        }

        return null;
    }
}
