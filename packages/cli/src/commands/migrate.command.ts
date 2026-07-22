import * as path from "path";
import * as fs from "fs-extra";
import ora from "ora";
import chalk from "chalk";
import * as dotenv from "dotenv";

/**
 * Real migration runner using Drizzle ORM's migrate() function.
 * Reads DB credentials from the environment (loaded from .env) and
 * runs all pending migrations from database/migrations/.
 */
export class MigrateCommand {
    async handle(options: { fresh?: boolean; seed?: boolean } = {}): Promise<void> {
        // Load .env so DB credentials are available
        dotenv.config({ path: path.join(process.cwd(), ".env") });

        const spinner = ora("Running database migrations").start();

        const migrationsDir = path.join(process.cwd(), "database/migrations");
        const migrationsFolder = migrationsDir;

        try {
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

            spinner.text = "Connecting to database...";

            // Dynamically import drizzle-orm/node-postgres and pg so this
            // file stays require()-able even without those deps installed
            // (they are a peer dep of @nyala/database).
            let Pool: any;
            let drizzle: any;
            let migrate: any;

            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                ({ Pool } = require("pg"));
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                ({ drizzle } = require("drizzle-orm/node-postgres"));
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                ({ migrate } = require("drizzle-orm/node-postgres/migrator"));
            } catch {
                spinner.fail(
                    "Could not load database driver.\n" +
                    "  Run: npm install pg drizzle-orm"
                );
                return;
            }

            const pool = new Pool({ connectionString });

            try {
                const db = drizzle(pool);
                spinner.text = "Running migrations...";

                await migrate(db, { migrationsFolder });

                await pool.end();
                spinner.succeed(chalk.green("All migrations applied successfully."));

                console.log(chalk.dim(`  Migrations folder: ${migrationsDir}`));

                if (options.seed) {
                    await this.runSeeders();
                }
            } catch (dbError: any) {
                await pool.end().catch(() => {});
                throw dbError;
            }
        } catch (error: any) {
            spinner.fail("Migration failed");
            console.error(chalk.red(error?.message ?? error));
            process.exit(1);
        }
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
            // Re-run all migrations from scratch
            await this.handle();
        } catch (e: any) {
            await pool.end().catch(() => {});
            spinner.fail("Fresh migration failed: " + (e?.message ?? e));
            process.exit(1);
        }
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
