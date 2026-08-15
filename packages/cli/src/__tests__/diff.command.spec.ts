import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { DiffCommand } from "../commands/diff.command";

const BASIC_STARTER_PATH = path.resolve(__dirname, "../../../../templates/basic-starter");

const spawnSyncMock = vi.fn();

vi.mock("child_process", () => ({
    spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

async function writeSchema(tmpDir: string) {
    await fs.ensureDir(path.join(tmpDir, "app/models"));
    await fs.writeFile(path.join(tmpDir, "app/models/index.ts"), 'export * from "./user.model";\n');
}

async function writeDatabaseConfig(tmpDir: string, driver: string) {
    await fs.ensureDir(path.join(tmpDir, "config"));
    await fs.writeFile(
        path.join(tmpDir, "config/database.ts"),
        `export default {\n    driver: process.env.DB_DRIVER || "${driver}",\n};\n`
    );
}

describe("DiffCommand — unit (mocked drizzle-kit)", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-diff-"));
        spawnSyncMock.mockReset();
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("fails cleanly when there's no schema file at the expected path", async () => {
        await writeDatabaseConfig(tmpDir, "postgres");

        await new DiffCommand(tmpDir).handle(undefined);

        expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    it("fails cleanly when config/database.ts has no recognizable driver", async () => {
        await writeSchema(tmpDir);
        // No config/database.ts at all.

        await new DiffCommand(tmpDir).handle(undefined);

        expect(spawnSyncMock).not.toHaveBeenCalled();
    });

    it("maps each known Nyala driver to the right drizzle-kit --dialect value", async () => {
        const cases: Array<[string, string]> = [
            ["pg", "postgresql"],
            ["postgres", "postgresql"],
            ["mysql2", "mysql"],
            ["better-sqlite3", "sqlite"],
        ];

        for (const [driver, dialect] of cases) {
            const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-diff-dialect-"));
            await writeSchema(dir);
            await writeDatabaseConfig(dir, driver);
            spawnSyncMock.mockReset();
            spawnSyncMock.mockReturnValue({ status: 0, stdout: "", stderr: "" });

            await new DiffCommand(dir).handle(undefined);

            expect(spawnSyncMock).toHaveBeenCalledWith(
                "npx",
                expect.arrayContaining(["--dialect", dialect]),
                expect.anything()
            );

            await fs.remove(dir);
        }
    });

    it("passes a RELATIVE --out path, never an absolute one (drizzle-kit silently mishandles absolute paths)", async () => {
        await writeSchema(tmpDir);
        await writeDatabaseConfig(tmpDir, "postgres");
        spawnSyncMock.mockReturnValue({ status: 0, stdout: "", stderr: "" });

        await new DiffCommand(tmpDir).handle(undefined);

        const call = spawnSyncMock.mock.calls[0];
        const args: string[] = call[1];
        const outIndex = args.indexOf("--out");
        const outValue = args[outIndex + 1];

        expect(path.isAbsolute(outValue)).toBe(false);
    });

    it("reports failure when drizzle-kit exits non-zero", async () => {
        await writeSchema(tmpDir);
        await writeDatabaseConfig(tmpDir, "postgres");
        spawnSyncMock.mockReturnValue({ status: 1, stdout: "", stderr: "boom" });

        await new DiffCommand(tmpDir).handle(undefined);

        const migrationsDir = path.join(tmpDir, "database/migrations");
        const files = (await fs.pathExists(migrationsDir)) ? await fs.readdir(migrationsDir) : [];
        expect(files.filter((f) => f.endsWith(".ts"))).toHaveLength(0);
    });

    it("reports failure when drizzle-kit exits 0 but prints an error (the real bug this regression-tests)", async () => {
        await writeSchema(tmpDir);
        await writeDatabaseConfig(tmpDir, "postgres");
        // Reproduces the real observed behavior: drizzle-kit 0.31.10 given a
        // broken --out path prints "Error: ENOENT..." to stdout but still
        // exits 0 — a naive `status !== 0` check misses this entirely.
        spawnSyncMock.mockReturnValue({
            status: 0,
            stdout: "Error: ENOENT: no such file or directory, open './/broken/path/meta/0000_snapshot.json'",
            stderr: "",
        });

        await new DiffCommand(tmpDir).handle(undefined);

        const migrationsDir = path.join(tmpDir, "database/migrations");
        const files = (await fs.pathExists(migrationsDir)) ? await fs.readdir(migrationsDir) : [];
        expect(files.filter((f) => f.endsWith(".ts"))).toHaveLength(0);
    });

    it("writes a real migration file wrapping the generated SQL in up(db)/down(db)", async () => {
        await writeSchema(tmpDir);
        await writeDatabaseConfig(tmpDir, "postgres");

        spawnSyncMock.mockImplementation((_cmd: string, args: string[]) => {
            // spawnSync is synchronous — writing the staged .sql file must
            // happen synchronously here too, or DiffCommand reads the
            // directory before this mock's write lands.
            const outIndex = args.indexOf("--out");
            const outDir = path.join(tmpDir, args[outIndex + 1]);
            fs.ensureDirSync(outDir);
            fs.writeFileSync(path.join(outDir, "0000_test.sql"), 'CREATE TABLE "users" ("id" uuid PRIMARY KEY);');
            return { status: 0, stdout: "", stderr: "" };
        });

        await new DiffCommand(tmpDir).handle("CreateUsers");

        const migrationsDir = path.join(tmpDir, "database/migrations");
        const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".ts") && f.includes("create-users"));
        expect(files).toHaveLength(1);

        const content = await fs.readFile(path.join(migrationsDir, files[0]), "utf-8");
        expect(content).toContain("export async function up(db: any)");
        expect(content).toContain("export async function down(db: any)");
        expect(content).toContain('CREATE TABLE "users"');
    });

    it("reports no changes when drizzle-kit produces no new .sql file", async () => {
        await writeSchema(tmpDir);
        await writeDatabaseConfig(tmpDir, "postgres");
        spawnSyncMock.mockReturnValue({ status: 0, stdout: "No schema changes, nothing to migrate", stderr: "" });

        await new DiffCommand(tmpDir).handle(undefined);

        const migrationsDir = path.join(tmpDir, "database/migrations");
        const files = (await fs.pathExists(migrationsDir)) ? await fs.readdir(migrationsDir) : [];
        expect(files.filter((f) => f.endsWith(".ts"))).toHaveLength(0);
    });

    it("only picks up the NEW .sql file, not ones already staged from a previous run", async () => {
        await writeSchema(tmpDir);
        await writeDatabaseConfig(tmpDir, "postgres");

        const stagingDir = path.join(tmpDir, "database/migrations/.drizzle-meta");
        await fs.ensureDir(stagingDir);
        await fs.writeFile(path.join(stagingDir, "0000_old.sql"), "CREATE TABLE old (id int);");

        spawnSyncMock.mockImplementation(() => {
            fs.writeFileSync(path.join(stagingDir, "0001_new.sql"), "ALTER TABLE old ADD COLUMN x int;");
            return { status: 0, stdout: "", stderr: "" };
        });

        await new DiffCommand(tmpDir).handle("AddColumn");

        const migrationsDir = path.join(tmpDir, "database/migrations");
        const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".ts"));
        expect(files).toHaveLength(1);

        const content = await fs.readFile(path.join(migrationsDir, files[0]), "utf-8");
        expect(content).toContain("ALTER TABLE old ADD COLUMN x int");
        expect(content).not.toContain("CREATE TABLE old");
    });
});
