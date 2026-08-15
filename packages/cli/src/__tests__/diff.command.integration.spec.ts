import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import { DiffCommand } from "../commands/diff.command";

/**
 * Real integration test — actually shells out to drizzle-kit (already a
 * devDependency of templates/basic-starter), not a mock. This is
 * deliberate: the two real bugs found while building DiffCommand (an
 * absolute --out path silently breaking drizzle-kit 0.31.10, and it
 * exiting 0 even after printing that failure) were both invisible to
 * mocked spawnSync tests — only running the real binary caught them. No
 * skipping this class of test just because it's slower.
 */
const BASIC_STARTER_PATH = path.resolve(__dirname, "../../../../templates/basic-starter");

const MODEL_PATH = path.join(BASIC_STARTER_PATH, "app/models/user.model.ts");
const STAGING_DIR = path.join(BASIC_STARTER_PATH, "database/migrations/.drizzle-meta");

async function cleanup() {
    await fs.remove(STAGING_DIR);
    const migrationsDir = path.join(BASIC_STARTER_PATH, "database/migrations");
    const files = await fs.readdir(migrationsDir);
    for (const file of files) {
        // Only remove files this test itself generates (timestamp-prefixed,
        // distinct from the template's real, hand-written 0001_*.ts).
        if (/^\d{14}_/.test(file)) {
            await fs.remove(path.join(migrationsDir, file));
        }
    }
}

describe("DiffCommand — real integration (actual drizzle-kit, actual templates/basic-starter)", () => {
    // Real spawnSync calls to `npx drizzle-kit` (three of them, in one test)
    // — ~5s in isolation, but this genuinely slows down a lot under full
    // monorepo parallel test runs (CPU contention across ~47 concurrent
    // tasks), not because anything here is actually hanging. Generous
    // timeouts rather than a flaky default.
    afterEach(async () => {
        await cleanup();
        await fs.copyFile(`${MODEL_PATH}.bak`, MODEL_PATH).catch(() => {});
        await fs.remove(`${MODEL_PATH}.bak`);
    }, 30000);

    it("generates a real CREATE TABLE migration on the first run, and a real incremental ALTER on the second", async () => {
        await cleanup();
        await fs.copyFile(MODEL_PATH, `${MODEL_PATH}.bak`);

        const command = new DiffCommand(BASIC_STARTER_PATH);

        // First run: no prior snapshot exists, so this is the full baseline.
        await command.handle("InitialBaseline");

        const migrationsDir = path.join(BASIC_STARTER_PATH, "database/migrations");
        let files = (await fs.readdir(migrationsDir)).filter((f) => f.includes("initial-baseline"));
        expect(files).toHaveLength(1);

        const baselineContent = await fs.readFile(path.join(migrationsDir, files[0]), "utf-8");
        expect(baselineContent).toContain('CREATE TABLE "users"');
        expect(baselineContent).toContain("export async function up(db: any)");

        // Second run: add a real column to the real model file, then diff again.
        const original = await fs.readFile(MODEL_PATH, "utf-8");
        const modified = original.replace(
            'emailVerifiedAt: timestamp("email_verified_at"),',
            'emailVerifiedAt: timestamp("email_verified_at"),\n    phoneNumber: varchar("phone_number", { length: 20 }),'
        );
        expect(modified).not.toBe(original); // sanity: the replace actually matched something
        await fs.writeFile(MODEL_PATH, modified);

        await command.handle("AddPhoneToUsers");

        files = (await fs.readdir(migrationsDir)).filter((f) => f.includes("add-phone-to-users"));
        expect(files).toHaveLength(1);

        const incrementalContent = await fs.readFile(path.join(migrationsDir, files[0]), "utf-8");
        expect(incrementalContent).toContain("ALTER TABLE");
        expect(incrementalContent).toContain("phone_number");
        // Must NOT re-emit the whole table — that would mean it diffed
        // against nothing instead of the first migration's snapshot.
        expect(incrementalContent).not.toContain("CREATE TABLE");

        // Third run: nothing changed since the last diff — must report that
        // cleanly rather than silently no-op'ing OR re-emitting the same SQL.
        const beforeThirdRun = (await fs.readdir(migrationsDir)).length;
        await command.handle("NothingChanged");
        const afterThirdRun = (await fs.readdir(migrationsDir)).length;
        expect(afterThirdRun).toBe(beforeThirdRun);
    }, 90000);
});
