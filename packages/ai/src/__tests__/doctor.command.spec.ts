import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { DoctorCommand, tenancyMiddlewareCheck, databaseDriverCheck } from "../cli/doctor.command";

const SAAS_STARTER_PATH = path.resolve(__dirname, "../../../../templates/saas-starter");

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
