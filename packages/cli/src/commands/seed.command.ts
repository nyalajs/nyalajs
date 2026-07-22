import * as path from "path";
import * as fs from "fs-extra";
import ora from "ora";
import chalk from "chalk";
import * as dotenv from "dotenv";

/**
 * db:seed — Discovers all seeder files in database/seeders/, instantiates
 * each one, connects to the database, and calls seeder.run(db).
 *
 * Usage:
 *   nyala db:seed              → runs all seeders in alphabetical order
 *   nyala db:seed --class UserSeeder  → runs only that seeder
 */
export class SeedCommand {
    async handle(options: { class?: string } = {}): Promise<void> {
        dotenv.config({ path: path.join(process.cwd(), ".env") });

        const seedersDir = path.join(process.cwd(), "database/seeders");
        const spinner = ora("Running seeders...").start();

        try {
            if (!(await fs.pathExists(seedersDir))) {
                spinner.info("No database/seeders directory found. Run `nyala generate seeder <Name>` first.");
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

            // Dynamically load pg + drizzle
            let Pool: any, drizzle: any;
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                ({ Pool } = require("pg"));
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                ({ drizzle } = require("drizzle-orm/node-postgres"));
            } catch {
                spinner.fail("pg / drizzle-orm not installed. Run: npm install pg drizzle-orm");
                return;
            }

            const pool = new Pool({ connectionString });
            const db = drizzle(pool);

            // Collect seeder files
            let files = (await fs.readdir(seedersDir))
                .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
                .sort();

            if (options.class) {
                const target = options.class.toLowerCase();
                files = files.filter((f) => f.toLowerCase().includes(target));
                if (files.length === 0) {
                    spinner.fail(`No seeder matching '${options.class}' found in database/seeders/.`);
                    await pool.end();
                    return;
                }
            }

            if (files.length === 0) {
                spinner.info("No seeder files found in database/seeders/.");
                await pool.end();
                return;
            }

            spinner.text = `Running ${files.length} seeder(s)...`;

            let ran = 0;
            for (const file of files) {
                const seederPath = path.join(seedersDir, file);
                const mod = await import(seederPath);
                // Support both default and named exports
                const SeederClass = mod.default ?? Object.values(mod).find((v: any) => typeof v === "function");

                if (!SeederClass) {
                    console.warn(chalk.yellow(`  Skipping ${file} — no exported class found.`));
                    continue;
                }

                const seeder = new (SeederClass as any)();
                if (typeof seeder.run !== "function") {
                    console.warn(chalk.yellow(`  Skipping ${file} — no run() method.`));
                    continue;
                }

                await seeder.run(db);
                console.log(chalk.green("  ✔ Seeded: ") + file);
                ran++;
            }

            await pool.end();
            spinner.succeed(chalk.green(`${ran} seeder(s) executed successfully.`));
        } catch (error: any) {
            spinner.fail("Seeding failed: " + (error?.message ?? error));
            process.exit(1);
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
