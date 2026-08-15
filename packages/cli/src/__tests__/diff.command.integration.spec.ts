import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import { randomUUID } from "crypto";
import { DiffCommand } from "../commands/diff.command";

/**
 * Real integration test — actually shells out to drizzle-kit (already a
 * devDependency of templates/basic-starter), not a mock. This is
 * deliberate: the two real bugs found while building DiffCommand (an
 * absolute --out path silently breaking drizzle-kit 0.31.10, and it
 * exiting 0 even after printing that failure) were both invisible to
 * mocked spawnSync tests — only running the real binary caught them. No
 * skipping this class of test just because it's slower.
 *
 * Runs against a COPY of templates/basic-starter, not the real template in
 * place — an earlier version of this test mutated templates/basic-starter
 * directly (writing real migration files into it, then cleaning up in
 * afterEach) and was genuinely unsafe: turbo runs `nyala-mvc-starter#build`
 * and `@nyalajs/cli#test` concurrently (they're independent nodes in the
 * task graph — test only formally depends on `@nyalajs/cli`'s OWN build,
 * not on every other package's build), so a real `tsc` build of
 * templates/basic-starter could — and, once, actually did — run while
 * this test's generated migration files briefly existed on disk, failing
 * that build on unrelated unused-variable errors from files this test was
 * about to delete.
 *
 * The copy lives under packages/cli/.tmp-test/ (gitignored), NOT
 * os.tmpdir() — drizzle-kit resolves drizzle-orm/pg-core by walking up
 * parent directories looking for node_modules starting from the schema
 * file's own location; templates/basic-starter's own node_modules doesn't
 * contain drizzle-orm (it's hoisted to the workspace root), so a copy
 * under /tmp has no parent chain back to that root and module resolution
 * fails. A copy inside the workspace tree reaches the real root
 * node_modules the same way the actual template does, no symlink needed.
 */
const REAL_BASIC_STARTER_PATH = path.resolve(__dirname, "../../../../templates/basic-starter");
const TMP_TEST_ROOT = path.resolve(__dirname, "../../.tmp-test");

describe("DiffCommand — real integration (actual drizzle-kit, against a copy of templates/basic-starter)", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = path.join(TMP_TEST_ROOT, `diff-integration-${randomUUID()}`);
        await fs.ensureDir(tmpDir);
        await fs.copy(REAL_BASIC_STARTER_PATH, tmpDir, {
            filter: (src) => !src.includes("node_modules") && !src.includes(`${path.sep}dist${path.sep}`) && !src.includes(".drizzle-meta"),
        });

        // The workspace root still hoists an older drizzle-kit (0.20.x, per
        // whatever other package still pins it) — templates/basic-starter
        // gets its OWN newer nested copy (0.31.10) specifically because its
        // declared version conflicts with the hoisted one. `npx drizzle-kit`
        // from inside the copy under .tmp-test/ would otherwise walk up and
        // find the stale root version first. `npx` resolves via
        // node_modules/.bin, not by requiring the package directly, so both
        // the package dir AND its .bin entry need to be symlinked —
        // verified directly: symlinking only the package dir still resolved
        // the stale root version, only adding .bin/drizzle-kit fixed it.
        await fs.ensureDir(path.join(tmpDir, "node_modules/.bin"));
        for (const pkg of ["drizzle-kit", "drizzle-orm"]) {
            const realPkgPath = path.join(REAL_BASIC_STARTER_PATH, "node_modules", pkg);
            if (await fs.pathExists(realPkgPath)) {
                await fs.symlink(realPkgPath, path.join(tmpDir, "node_modules", pkg), "dir");
            }
        }
        const realBinPath = path.join(REAL_BASIC_STARTER_PATH, "node_modules/.bin/drizzle-kit");
        if (await fs.pathExists(realBinPath)) {
            await fs.symlink(realBinPath, path.join(tmpDir, "node_modules/.bin/drizzle-kit"));
        }
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    }, 30000);

    it("generates a real CREATE TABLE migration on the first run, and a real incremental ALTER on the second", async () => {
        const modelPath = path.join(tmpDir, "app/models/user.model.ts");
        const command = new DiffCommand(tmpDir);

        // First run: no prior snapshot exists, so this is the full baseline.
        await command.handle("InitialBaseline");

        const migrationsDir = path.join(tmpDir, "database/migrations");
        let files = (await fs.readdir(migrationsDir)).filter((f) => f.includes("initial-baseline"));
        expect(files).toHaveLength(1);

        const baselineContent = await fs.readFile(path.join(migrationsDir, files[0]), "utf-8");
        expect(baselineContent).toContain('CREATE TABLE "users"');
        expect(baselineContent).toContain("export async function up(db: any)");

        // Second run: add a real column to the real model file, then diff again.
        const original = await fs.readFile(modelPath, "utf-8");
        const modified = original.replace(
            'emailVerifiedAt: timestamp("email_verified_at"),',
            'emailVerifiedAt: timestamp("email_verified_at"),\n    phoneNumber: varchar("phone_number", { length: 20 }),'
        );
        expect(modified).not.toBe(original); // sanity: the replace actually matched something
        await fs.writeFile(modelPath, modified);

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
