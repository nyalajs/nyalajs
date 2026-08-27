import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { NewCommand } from "../commands/new.command";

/**
 * Real regression test for a genuine, previously-shipped bug: `nyala new
 * --template=mvc/saas/cms/inertia` resolved the template's source
 * directory via `path.join(__dirname, "../../../../templates", folder)` —
 * correct ONLY inside this monorepo's own dev checkout. The published
 * `@nyalajs/cli` npm package never included the top-level templates/
 * directory at all (confirmed by inspecting the real published tarball
 * with `npm pack --dry-run`), so for every real end user, EVERY
 * `--template=X` request silently fell back to the bare/empty scaffold,
 * with no error or warning that anything had gone wrong.
 *
 * Fixed by bundling each template's git-tracked files into
 * packages/cli/runtime/templates/<folder>/ at build time
 * (scripts/copy-templates.js, run as a `prebuild` step) and having
 * NewCommand look there FIRST, falling back to the monorepo's own
 * templates/ directory only for local dev convenience.
 *
 * These tests run against whatever is ACTUALLY present in
 * runtime/templates/ at test time — i.e. they only pass if `npm run
 * build` (or at least the `prebuild` step) has run for this package,
 * exactly mirroring what a real `npm install @nyalajs/cli` gives a user.
 * If someone reintroduces the old __dirname math and breaks the bundled
 * path, this fails loudly instead of silently falling back.
 */
describe("NewCommand — template resolution actually finds the bundled templates", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-new-command-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("runtime/templates/ is actually populated (prebuild step ran) — the precondition every other test in this file depends on", async () => {
        const bundledDir = path.join(__dirname, "../../runtime/templates");
        const exists = await fs.pathExists(bundledDir);
        expect(exists).toBe(true);

        const entries = await fs.readdir(bundledDir);
        expect(entries.sort()).toEqual(["basic-starter", "cms-starter", "inertia-starter", "saas-starter"]);
    });

    it("--template=mvc produces the REAL mvc starter (auth.controller.ts etc.), not the bare scaffold", async () => {
        await new NewCommand(tmpDir).execute("my-mvc-app", { template: "mvc", database: "sqlite" });

        const controllersDir = path.join(tmpDir, "my-mvc-app/app/controllers");
        const controllers = await fs.readdir(controllersDir);
        expect(controllers.sort()).toEqual(["auth.controller.ts", "home.controller.ts", "users.controller.ts"]);

        // The real starter template ships a Dockerfile — the bare scaffold never does.
        expect(await fs.pathExists(path.join(tmpDir, "my-mvc-app/Dockerfile"))).toBe(true);
    });

    it("--template=saas produces the real saas starter (tenant.model.ts etc.)", async () => {
        await new NewCommand(tmpDir).execute("my-saas-app", { template: "saas", database: "sqlite" });

        expect(await fs.pathExists(path.join(tmpDir, "my-saas-app/app/models/tenant.model.ts"))).toBe(true);
        expect(await fs.pathExists(path.join(tmpDir, "my-saas-app/app/repositories/tenant.repository.ts"))).toBe(true);
    });

    it("--template=cms produces the real cms starter (admin controllers, islands)", async () => {
        await new NewCommand(tmpDir).execute("my-cms-app", { template: "cms", database: "sqlite" });

        expect(await fs.pathExists(path.join(tmpDir, "my-cms-app/app/controllers/admin"))).toBe(true);
        expect(await fs.pathExists(path.join(tmpDir, "my-cms-app/app/islands/manifest.ts"))).toBe(true);
    });

    it("--template=inertia produces the real inertia starter (resources/js frontend)", async () => {
        await new NewCommand(tmpDir).execute("my-inertia-app", { template: "inertia", database: "sqlite" });

        expect(await fs.pathExists(path.join(tmpDir, "my-inertia-app/resources/js/app.tsx"))).toBe(true);
        expect(await fs.pathExists(path.join(tmpDir, "my-inertia-app/app/controllers/posts.controller.ts"))).toBe(true);
    });

    it("--template=basic still correctly produces the bare/empty scaffold, on purpose (no template folder mapped for it)", async () => {
        await new NewCommand(tmpDir).execute("my-basic-app", { template: "basic", database: "sqlite" });

        // The bare scaffold has NO real controller files, just .gitkeep placeholders.
        const controllersDir = path.join(tmpDir, "my-basic-app/app/controllers");
        const entries = await fs.readdir(controllersDir);
        expect(entries).toEqual([".gitkeep"]);
    });

    it("the bare scaffold's package.json uses \"*\" version ranges, not stale hardcoded old-major pins", async () => {
        await new NewCommand(tmpDir).execute("my-basic-app-2", { template: "basic", database: "sqlite" });

        const pkg = await fs.readJSON(path.join(tmpDir, "my-basic-app-2/package.json"));
        expect(pkg.dependencies["@nyalajs/core"]).toBe("*");
        expect(pkg.dependencies["@nyalajs/http"]).toBe("*");
        expect(pkg.dependencies["@nyalajs/config"]).toBe("*");
    });

    it("every real starter template's copied package.json ALSO uses \"*\" (or an already-correct explicit range) — never a stale major-version-behind pin", async () => {
        await new NewCommand(tmpDir).execute("my-mvc-app-2", { template: "mvc", database: "sqlite" });

        const pkg = await fs.readJSON(path.join(tmpDir, "my-mvc-app-2/package.json"));
        // Every @nyalajs/* dependency the real starter declares must not be
        // pinned to a stale "^1.x" — the exact class of bug this whole
        // file exists to guard against.
        for (const [name, range] of Object.entries(pkg.dependencies) as [string, string][]) {
            if (name.startsWith("@nyalajs/")) {
                expect(range, `${name} should not be pinned to a stale major version`).not.toMatch(/^\^1\./);
            }
        }
    });

    it("copied package.json's name field is overwritten to the new project's name", async () => {
        await new NewCommand(tmpDir).execute("totally-custom-name", { template: "mvc", database: "sqlite" });

        const pkg = await fs.readJSON(path.join(tmpDir, "totally-custom-name/package.json"));
        expect(pkg.name).toBe("totally-custom-name");
    });
});
