import "reflect-metadata";
import { describe, it, expect } from "vitest";
import * as path from "path";
import { ProjectContextService } from "../context/project-context.service";

/**
 * Runs against templates/basic-starter — a real, working Nyala app already
 * in this repo (verified elsewhere this session to build/typecheck clean)
 * — rather than a synthetic fixture, since the whole point of this service
 * is booting a real app for real structural data. templates/basic-starter's
 * providers have no OnModuleInit/OnApplicationBootstrap side effects, so
 * booting it here is safe.
 */
const BASIC_STARTER_PATH = path.resolve(__dirname, "../../../../templates/basic-starter");

describe("ProjectContextService", () => {
    it("boots the real app and reports its actual module graph and routes", async () => {
        const service = new ProjectContextService();

        const structure = await service.getStructure({ cwd: BASIC_STARTER_PATH, timeoutMs: 60_000 });

        expect(structure.modules).toHaveLength(1);
        expect(structure.modules[0].name).toBe("AppModule");
        expect(structure.modules[0].controllers.sort()).toEqual(
            ["AuthController", "HomeController", "UsersController"].sort()
        );
        expect(structure.modules[0].providers).toContain("AuthService");
        expect(structure.modules[0].providers).toContain("UserRepository");
    }, 60_000);

    it("reports real, decorator-resolved routes — not a guess", async () => {
        const service = new ProjectContextService();

        const structure = await service.getStructure({ cwd: BASIC_STARTER_PATH, timeoutMs: 60_000 });

        expect(structure.routes).toContainEqual({
            method: "POST",
            path: "/auth/login",
            controller: "AuthController",
            handler: "login",
        });
        expect(structure.routes).toContainEqual({
            method: "DELETE",
            path: "/users/:id",
            controller: "UsersController",
            handler: "destroy",
        });
    }, 60_000);

    it("caches the result — a second call doesn't re-spawn the subprocess", async () => {
        const service = new ProjectContextService();

        const first = await service.getStructure({ cwd: BASIC_STARTER_PATH, timeoutMs: 60_000 });
        const second = await service.getStructure({ cwd: BASIC_STARTER_PATH, timeoutMs: 60_000 });

        expect(second).toBe(first); // same object reference — proves it was cached, not recomputed
    }, 60_000);

    it("invalidate() forces a fresh introspection on the next call", async () => {
        const service = new ProjectContextService();

        const first = await service.getStructure({ cwd: BASIC_STARTER_PATH, timeoutMs: 60_000 });
        service.invalidate();
        const second = await service.getStructure({ cwd: BASIC_STARTER_PATH, timeoutMs: 60_000 });

        expect(second).not.toBe(first);
        expect(second).toEqual(first); // different object, same real data
    }, 60_000);

    it("throws a clear error when no root module exists at the expected path", async () => {
        const service = new ProjectContextService();

        await expect(
            service.getStructure({ cwd: "/tmp", appModulePath: "bootstrap/app.module.ts" })
        ).rejects.toThrow(/No root module found/);
    });
});
