import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import {
    DoctorCommand,
    tenancyMiddlewareCheck,
    databaseDriverCheck,
    guardsWiredCheck,
    guardProvidersRegisteredCheck,
} from "../cli/doctor.command";

const SAAS_STARTER_PATH = path.resolve(__dirname, "../../../../templates/saas-starter");
const CMS_STARTER_PATH = path.resolve(__dirname, "../../../../templates/cms-starter");
const INERTIA_STARTER_PATH = path.resolve(__dirname, "../../../../templates/inertia-starter");

describe("tenancyMiddlewareCheck — against the real saas-starter template", () => {
    it("passes against templates/saas-starter, which this session fixed to wire TenantMiddleware correctly", async () => {
        const result = await tenancyMiddlewareCheck.run(SAAS_STARTER_PATH);
        expect(result.status).toBe("pass");
    });

    it("would have failed against saas-starter's ORIGINAL state (TenantMiddleware never registered)", async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-doctor-broken-"));
        try {
            await fs.writeJson(path.join(tmpDir, "package.json"), {
                dependencies: { "@nyalajs/tenancy": "*" },
            });
            await fs.ensureDir(path.join(tmpDir, "config"));
            await fs.ensureDir(path.join(tmpDir, "bootstrap"));
            // Reproduces the exact original bug: middleware config has no TenantMiddleware entry.
            await fs.writeFile(path.join(tmpDir, "config/middleware.ts"), "export default { global: [] };\n");
            await fs.writeFile(path.join(tmpDir, "bootstrap/app.module.ts"), "export class AppModule {}\n");

            const result = await tenancyMiddlewareCheck.run(tmpDir);

            expect(result.status).toBe("fail");
            expect(result.message).toContain("Tenant context required");
        } finally {
            await fs.remove(tmpDir);
        }
    });
});

describe("tenancyMiddlewareCheck — basic behavior", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-doctor-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("passes (skips) when @nyalajs/tenancy isn't a dependency at all", async () => {
        await fs.writeJson(path.join(tmpDir, "package.json"), { dependencies: {} });
        const result = await tenancyMiddlewareCheck.run(tmpDir);
        expect(result.status).toBe("pass");
        expect(result.message).toContain("not a dependency");
    });

    it("passes (skips) when there is no package.json", async () => {
        const result = await tenancyMiddlewareCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("passes when both files reference TenantMiddleware", async () => {
        await fs.writeJson(path.join(tmpDir, "package.json"), { dependencies: { "@nyalajs/tenancy": "*" } });
        await fs.ensureDir(path.join(tmpDir, "config"));
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
        await fs.writeFile(path.join(tmpDir, "config/middleware.ts"), "import { TenantMiddleware } from '@nyalajs/tenancy';\nexport default { global: [TenantMiddleware] };\n");
        await fs.writeFile(path.join(tmpDir, "bootstrap/app.module.ts"), "TenantMiddleware,\n");

        const result = await tenancyMiddlewareCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });
});

describe("databaseDriverCheck", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-doctor-db-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("fails when the configured driver's package isn't installed", async () => {
        await fs.writeJson(path.join(tmpDir, "package.json"), { dependencies: { "@nyalajs/database": "*" } });
        await fs.ensureDir(path.join(tmpDir, "config"));
        await fs.writeFile(path.join(tmpDir, "config/database.ts"), 'export default { driver: "mysql2" };\n');

        const result = await databaseDriverCheck.run(tmpDir);

        expect(result.status).toBe("fail");
        expect(result.message).toContain("npm install mysql2");
    });

    it("passes when the configured driver's package is installed", async () => {
        await fs.writeJson(path.join(tmpDir, "package.json"), {
            dependencies: { "@nyalajs/database": "*", pg: "^8.0.0" },
        });
        await fs.ensureDir(path.join(tmpDir, "config"));
        await fs.writeFile(path.join(tmpDir, "config/database.ts"), 'export default { driver: "pg" };\n');

        const result = await databaseDriverCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("skips when @nyalajs/database isn't used", async () => {
        await fs.writeJson(path.join(tmpDir, "package.json"), { dependencies: {} });
        const result = await databaseDriverCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });
});

describe("guardsWiredCheck — against the real cms-starter template", () => {
    it("passes against templates/cms-starter, which genuinely uses @UseGuards() and resolves the fixed @nyalajs/core from the workspace", async () => {
        const result = await guardsWiredCheck.run(CMS_STARTER_PATH);
        expect(result.status).toBe("pass");
        expect(result.message).toContain("@nyalajs/core@");
    });
});

describe("guardsWiredCheck — basic behavior", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-doctor-guards-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("skips when no app/src source uses @UseGuards() or @UseInterceptors()", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(path.join(tmpDir, "app/controllers/home.controller.ts"), "export class HomeController {}\n");

        const result = await guardsWiredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
        expect(result.message).toContain("No @UseGuards()");
    });

    it("skips when there's no app/ or src/ directory at all", async () => {
        const result = await guardsWiredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("warns when @nyalajs/core can't be resolved from cwd (not installed / no npm install yet)", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            "@UseGuards(AuthGuard)\nexport class AdminController {}\n"
        );

        const result = await guardsWiredCheck.run(tmpDir);
        expect(result.status).toBe("warn");
        expect(result.message).toContain("couldn't resolve");
    });

    it("fails when @UseGuards() is used with an @nyalajs/core version older than the fix", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            "@UseGuards(AuthGuard)\nexport class AdminController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "node_modules/@nyalajs/core"));
        await fs.writeJson(path.join(tmpDir, "node_modules/@nyalajs/core/package.json"), {
            name: "@nyalajs/core",
            version: "2.0.0",
            main: "index.js",
        });
        await fs.writeFile(path.join(tmpDir, "node_modules/@nyalajs/core/index.js"), "module.exports = {};\n");

        const result = await guardsWiredCheck.run(tmpDir);

        expect(result.status).toBe("fail");
        expect(result.message).toContain("@nyalajs/core@2.0.0");
        expect(result.message).toContain("npm install @nyalajs/core@latest");
    });

    it("passes when @UseGuards() is used with an @nyalajs/core version at or above the fix", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            "@UseInterceptors(AuditInterceptor)\nexport class AdminController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "node_modules/@nyalajs/core"));
        await fs.writeJson(path.join(tmpDir, "node_modules/@nyalajs/core/package.json"), {
            name: "@nyalajs/core",
            version: "2.0.1",
            main: "index.js",
        });
        await fs.writeFile(path.join(tmpDir, "node_modules/@nyalajs/core/index.js"), "module.exports = {};\n");

        const result = await guardsWiredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("passes for a version well above the fix (e.g. a future 2.5.0)", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            "@UseGuards(AuthGuard)\nexport class AdminController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "node_modules/@nyalajs/core"));
        await fs.writeJson(path.join(tmpDir, "node_modules/@nyalajs/core/package.json"), {
            name: "@nyalajs/core",
            version: "2.5.0",
            main: "index.js",
        });
        await fs.writeFile(path.join(tmpDir, "node_modules/@nyalajs/core/index.js"), "module.exports = {};\n");

        const result = await guardsWiredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });
});

describe("guardProvidersRegisteredCheck — against the real templates, all fixed", () => {
    it("passes against templates/cms-starter (SessionAuthGuard + RolesGuard both registered)", async () => {
        const result = await guardProvidersRegisteredCheck.run(CMS_STARTER_PATH);
        expect(result.status).toBe("pass");
    });

    it("passes against templates/saas-starter (AuthGuard + RolesGuard both registered)", async () => {
        const result = await guardProvidersRegisteredCheck.run(SAAS_STARTER_PATH);
        expect(result.status).toBe("pass");
    });

    it("passes against templates/inertia-starter (SessionAuthGuard registered)", async () => {
        const result = await guardProvidersRegisteredCheck.run(INERTIA_STARTER_PATH);
        expect(result.status).toBe("pass");
    });
});

describe("guardProvidersRegisteredCheck — basic behavior", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-doctor-guard-providers-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("skips when no app/src source uses @UseGuards()/@UseInterceptors()/@UseFilters()", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(path.join(tmpDir, "app/controllers/home.controller.ts"), "export class HomeController {}\n");

        const result = await guardProvidersRegisteredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
        expect(result.message).toContain("No @UseGuards()");
    });

    it("skips when there's no app/ or src/ directory at all", async () => {
        const result = await guardProvidersRegisteredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("warns when a guard class used in @UseGuards() is missing from every providers array — regression test for the real bug found in cms-starter/saas-starter/inertia-starter", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            '@UseGuards(SessionAuthGuard)\nexport class AdminController {}\n'
        );
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
        await fs.writeFile(
            path.join(tmpDir, "bootstrap/app.module.ts"),
            "@Module({ providers: [AuthService], controllers: [AdminController] })\nexport class AppModule {}\n"
        );

        const result = await guardProvidersRegisteredCheck.run(tmpDir);

        expect(result.status).toBe("warn");
        expect(result.message).toContain("SessionAuthGuard");
        expect(result.message).toContain("app/controllers/admin.controller.ts");
    });

    it("passes when the guard class IS in the providers array", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            "@UseGuards(SessionAuthGuard)\nexport class AdminController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
        await fs.writeFile(
            path.join(tmpDir, "bootstrap/app.module.ts"),
            "@Module({ providers: [AuthService, SessionAuthGuard], controllers: [AdminController] })\nexport class AppModule {}\n"
        );

        const result = await guardProvidersRegisteredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("checks every class when @UseGuards() lists more than one (e.g. @UseGuards(AuthGuard, RolesGuard))", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/users.controller.ts"),
            "@UseGuards(AuthGuard, RolesGuard)\nexport class UsersController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
        // Only AuthGuard registered — RolesGuard missing, matching the exact
        // real bug found in templates/saas-starter's users.controller.ts.
        await fs.writeFile(
            path.join(tmpDir, "bootstrap/app.module.ts"),
            "@Module({ providers: [AuthGuard], controllers: [UsersController] })\nexport class AppModule {}\n"
        );

        const result = await guardProvidersRegisteredCheck.run(tmpDir);

        expect(result.status).toBe("warn");
        expect(result.message).toContain("RolesGuard");
        // Only RolesGuard should be reported missing, not AuthGuard (which
        // IS registered) — count occurrences rather than a substring check,
        // since "RolesGuard" itself contains no "AuthGuard" but a naive
        // check could be fooled either way.
        const missingCount = (result.message.match(/AuthGuard \(/g) ?? []).length;
        expect(missingCount).toBe(0);
    });

    it("finds a providers array in a file other than bootstrap/app.module.ts", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/admin.controller.ts"),
            "@UseGuards(SessionAuthGuard)\nexport class AdminController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
        await fs.writeFile(
            path.join(tmpDir, "bootstrap/security.module.ts"),
            "@Module({ providers: [SessionAuthGuard] })\nexport class SecurityModule {}\n"
        );

        const result = await guardProvidersRegisteredCheck.run(tmpDir);
        expect(result.status).toBe("pass");
    });

    it("checks @UseFilters() too, not just @UseGuards()/@UseInterceptors()", async () => {
        await fs.ensureDir(path.join(tmpDir, "app/controllers"));
        await fs.writeFile(
            path.join(tmpDir, "app/controllers/posts.controller.ts"),
            "@UseFilters(NotFoundFilter)\nexport class PostsController {}\n"
        );
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
        await fs.writeFile(
            path.join(tmpDir, "bootstrap/app.module.ts"),
            "@Module({ providers: [], controllers: [PostsController] })\nexport class AppModule {}\n"
        );

        const result = await guardProvidersRegisteredCheck.run(tmpDir);

        expect(result.status).toBe("warn");
        expect(result.message).toContain("NotFoundFilter");
    });
});

describe("DoctorCommand", () => {
    it("runs every check and returns their results", async () => {
        const command = new DoctorCommand({
            cwd: "/irrelevant",
            checks: [
                { name: "a", run: async () => ({ name: "a", status: "pass", message: "ok" }) },
                { name: "b", run: async () => ({ name: "b", status: "fail", message: "broken" }) },
            ],
        });

        const results = await command.run();
        expect(results).toEqual([
            { name: "a", status: "pass", message: "ok" },
            { name: "b", status: "fail", message: "broken" },
        ]);
    });

    it("runAndPrint() returns false when any check fails", async () => {
        const command = new DoctorCommand({
            checks: [{ name: "a", run: async () => ({ name: "a", status: "fail", message: "broken" }) }],
        });

        expect(await command.runAndPrint()).toBe(false);
    });

    it("runAndPrint() returns true when all checks pass or warn", async () => {
        const command = new DoctorCommand({
            checks: [
                { name: "a", run: async () => ({ name: "a", status: "pass", message: "ok" }) },
                { name: "b", run: async () => ({ name: "b", status: "warn", message: "hm" }) },
            ],
        });

        expect(await command.runAndPrint()).toBe(true);
    });
});
