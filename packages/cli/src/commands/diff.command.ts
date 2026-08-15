import * as path from "path";
import * as fs from "fs-extra";
import ora from "ora";
import chalk from "chalk";
import { spawnSync } from "child_process";

/**
 * Nyala driver name -> drizzle-kit's --dialect value. Mirrors
 * @nyalajs/database's DRIVER_DIALECTS (packages/database/src/dialect.ts) —
 * duplicated rather than imported so packages/cli doesn't need to depend on
 * @nyalajs/database just for this one small map, matching how
 * doctor.command.ts's databaseDriverCheck already reads config/database.ts
 * by regex instead of importing the target project's own config module.
 */
const DRIVER_TO_DRIZZLE_DIALECT: Record<string, "postgresql" | "mysql" | "sqlite"> = {
    pg: "postgresql",
    postgres: "postgresql",
    mysql2: "mysql",
    "better-sqlite3": "sqlite",
};

/**
 * Schema-diff migration generation — the gap Rails/Django/Prisma close and
 * Nyala didn't: `nyala generate migration <name>` only ever scaffolded an
 * empty TODO stub, because there was no tooling comparing your Drizzle
 * model definitions against what's actually been migrated so far.
 *
 * `drizzle-kit generate` (already a devDependency in every starter
 * template, previously unused by the CLI) does exactly that: it snapshots
 * app/models/index.ts, diffs it against its own prior snapshots, and
 * produces the SQL to get from one to the other.
 *
 * The output format doesn't match MigrateCommand's up(db)/down(db) TS-stub
 * convention (migration-runner.ts only ever imports and calls those
 * functions — it has no concept of running a raw .sql file), so this
 * command runs drizzle-kit into a hidden staging directory and wraps
 * whatever SQL it produces in a real migration file, rather than
 * replacing the existing migration format with a second, incompatible one.
 */
export class DiffCommand {
    constructor(private readonly cwd: string = process.cwd()) {}

    async handle(name: string | undefined, options: { schema?: string } = {}): Promise<void> {
        const cwd = this.cwd;
        const spinner = ora("Diffing schema against app/models...").start();

        const schemaPath = options.schema ?? "app/models/index.ts";
        if (!(await fs.pathExists(path.join(cwd, schemaPath)))) {
            spinner.fail(`No schema found at ${schemaPath}. Pass --schema <path> if your models live elsewhere.`);
            return;
        }

        const dialect = await this.resolveDialect(cwd);
        if (!dialect) {
            spinner.fail(
                "Couldn't determine your database dialect from config/database.ts's `driver` field.\n" +
                "  Recognized drivers: " + Object.keys(DRIVER_TO_DRIZZLE_DIALECT).join(", ")
            );
            return;
        }

        // drizzle-kit tracks prior snapshots itself (a _meta/ dir it manages
        // inside --out), so re-running this command incrementally diffs
        // against the LAST generated migration, not from scratch each time
        // — reuse database/migrations/.drizzle-meta across runs rather than
        // starting a fresh staging dir every time, or every diff would
        // re-emit the full schema instead of just what changed.
        //
        // --out MUST be relative, not path.join(cwd, ...): drizzle-kit
        // (verified against 0.31.10) internally prepends "./" to whatever
        // --out it's given, so an absolute path becomes a broken one
        // (".//home/you/project/database/...") — and it fails SILENTLY,
        // printing an error but still exiting 0, so this isn't optional.
        const stagingDirRelative = "database/migrations/.drizzle-meta";
        const stagingDir = path.join(cwd, stagingDirRelative);
        await fs.ensureDir(stagingDir);

        const existingSqlFiles = new Set(
            (await fs.readdir(stagingDir)).filter((f) => f.endsWith(".sql"))
        );

        const result = spawnSync(
            "npx",
            ["drizzle-kit", "generate", "--schema", schemaPath, "--out", stagingDirRelative, "--dialect", dialect],
            { cwd, encoding: "utf-8" }
        );

        const sawError = /error/i.test(result.stderr ?? "") || /error/i.test(result.stdout ?? "");
        if (result.status !== 0 || sawError) {
            spinner.fail("drizzle-kit generate failed:\n" + (result.stderr || result.stdout || ""));
            return;
        }

        const allSqlFiles = (await fs.readdir(stagingDir)).filter((f) => f.endsWith(".sql"));
        const newSqlFile = allSqlFiles.find((f) => !existingSqlFiles.has(f));

        if (!newSqlFile) {
            spinner.succeed("No schema changes detected — nothing to migrate.");
            return;
        }

        const sql = (await fs.readFile(path.join(stagingDir, newSqlFile), "utf-8")).trim();

        const fileName = `${this.timestamp()}_${this.toKebabCase(name ?? "schema_diff")}`;
        const migrationPath = path.join(cwd, "database/migrations", `${fileName}.ts`);
        await fs.writeFile(migrationPath, this.buildMigrationFile(sql, newSqlFile));

        spinner.succeed(chalk.green("Generated migration from schema diff:"));
        console.log(chalk.cyan(`  database/migrations/${fileName}.ts`));
        console.log(chalk.dim(`\n  (SQL sourced from drizzle-kit, staged at database/migrations/.drizzle-meta/${newSqlFile})`));
    }

    private buildMigrationFile(sql: string, sourceFile: string): string {
        const statements = sql
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);

        const executeCalls = statements
            .map((stmt) => `    await db.execute(sql\`${stmt};\`);`)
            .join("\n");

        return `import { sql } from "drizzle-orm";

/**
 * Auto-generated from a schema diff by \`nyala db:diff\` — source SQL at
 * database/migrations/.drizzle-meta/${sourceFile}.
 *
 * drizzle-kit only generates forward SQL (same as Prisma) — write down()
 * yourself if you need this migration to be reversible.
 */
export async function up(db: any): Promise<void> {
${executeCalls}
}

export async function down(db: any): Promise<void> {
    // TODO: drizzle-kit doesn't generate a reverse migration — write the
    // inverse of the SQL above by hand if you need this to be rollback-able.
}
`;
    }

    private async resolveDialect(cwd: string): Promise<"postgresql" | "mysql" | "sqlite" | null> {
        const configPath = path.join(cwd, "config/database.ts");
        if (!(await fs.pathExists(configPath))) return null;

        const source = await fs.readFile(configPath, "utf-8");
        const match = source.match(/driver\s*:\s*(?:process\.env\.\w+\s*\|\|\s*)?["']([\w-]+)["']/);
        if (!match) return null;

        return DRIVER_TO_DRIZZLE_DIALECT[match[1]] ?? null;
    }

    private timestamp(): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }

    private toKebabCase(name: string): string {
        return name
            .replace(/([a-z])([A-Z])/g, "$1-$2")
            .replace(/[\s_]+/g, "-")
            .toLowerCase();
    }
}
