import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseService, Model } from "@nyalajs/database";
import { TenantRegistry } from "../registry/tenant-registry.service";

/**
 * Real, unmocked exercise of TenantRegistry against a real better-sqlite3
 * file — register/find/setIsolation/setMigrationStatus, and the in-process
 * cache's behavior (serves cached reads, invalidates itself on every
 * write, respects its TTL).
 */
describe("TenantRegistry — real CRUD + cache behavior over a real SQLite file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-tenant-registry-"));
    const dbPath = path.join(tmpDir, "registry.sqlite");
    const service = new DatabaseService();

    beforeAll(async () => {
        await service.connect({ driver: "better-sqlite3", connectionString: dbPath });
        Model.setDatabase(service.getDb());
        (service.getDb() as any).run(
            "CREATE TABLE IF NOT EXISTS nyala_tenants (" +
            "id TEXT PRIMARY KEY, name TEXT NOT NULL, isolationMode TEXT NOT NULL, " +
            "connectionString TEXT, driver TEXT, migrationStatus TEXT NOT NULL, " +
            "createdAt INTEGER, updatedAt INTEGER)"
        );
    });

    afterAll(async () => {
        await service.disconnect();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("register() persists a real row, retrievable via find()", async () => {
        const registry = new TenantRegistry(30_000);
        const created = await registry.register({ id: "reg-a", name: "Registry A" });
        expect(created.isolationMode).toBe("shared");
        expect(created.migrationStatus).toBe("none");

        const raw = (service.getDb() as any).all("SELECT * FROM nyala_tenants WHERE id = 'reg-a'");
        expect(raw).toHaveLength(1);
        expect(raw[0].name).toBe("Registry A");
    });

    it("find() returns null for an unregistered tenant, findOrThrow() throws with a clear message", async () => {
        const registry = new TenantRegistry(30_000);
        expect(await registry.find("nobody")).toBeNull();
        await expect(registry.findOrThrow("nobody")).rejects.toThrow(/Unknown tenant: "nobody"/);
    });

    it("caches a find() result — a row deleted directly from the DB (bypassing the registry) still returns the cached value until invalidated", async () => {
        const registry = new TenantRegistry(30_000); // long TTL — must not expire during this test
        await registry.register({ id: "reg-cache", name: "Cached Tenant" });

        const first = await registry.find("reg-cache");
        expect(first).not.toBeNull();

        // Delete directly, bypassing the registry entirely.
        (service.getDb() as any).run("DELETE FROM nyala_tenants WHERE id = 'reg-cache'");

        // Still served from cache — proves find() isn't hitting the DB every call.
        const second = await registry.find("reg-cache");
        expect(second).not.toBeNull();
        expect(second!.name).toBe("Cached Tenant");

        // Explicit invalidation forces a real re-read, which now correctly reflects the deletion.
        registry.invalidate("reg-cache");
        const third = await registry.find("reg-cache");
        expect(third).toBeNull();
    });

    it("a short TTL expires the cache on its own, without explicit invalidate()", async () => {
        const registry = new TenantRegistry(20);
        await registry.register({ id: "reg-ttl", name: "TTL Tenant" });

        (service.getDb() as any).run("UPDATE nyala_tenants SET name = 'Updated Directly' WHERE id = 'reg-ttl'");

        // Still within the TTL window — cached value.
        const cached = await registry.find("reg-ttl");
        expect(cached!.name).toBe("TTL Tenant");

        await new Promise((r) => setTimeout(r, 40));

        const fresh = await registry.find("reg-ttl");
        expect(fresh!.name).toBe("Updated Directly");
    });

    it("setIsolation() updates the row AND invalidates the cache — the very next find() sees the new isolation mode immediately, no stale TTL window", async () => {
        const registry = new TenantRegistry(30_000); // long TTL — proves invalidation, not TTL expiry, is what makes this work
        await registry.register({ id: "reg-flip", name: "Flip Tenant" });
        await registry.find("reg-flip"); // populate the cache

        await registry.setIsolation("reg-flip", {
            isolationMode: "dedicated",
            connectionString: "postgres://dedicated-host/reg-flip",
            driver: "pg",
        });

        const updated = await registry.find("reg-flip");
        expect(updated!.isolationMode).toBe("dedicated");
        expect(updated!.connectionString).toBe("postgres://dedicated-host/reg-flip");
        expect(updated!.driver).toBe("pg");

        const raw = (service.getDb() as any).all("SELECT * FROM nyala_tenants WHERE id = 'reg-flip'");
        expect(raw[0].isolationMode).toBe("dedicated");
    });

    it("setIsolation() back to 'shared' nulls out connectionString/driver", async () => {
        const registry = new TenantRegistry(30_000);
        await registry.register({
            id: "reg-revert",
            name: "Revert Tenant",
            isolationMode: "dedicated",
            connectionString: "postgres://old-dedicated-host/reg-revert",
            driver: "pg",
        });

        await registry.setIsolation("reg-revert", { isolationMode: "shared" });

        const updated = await registry.find("reg-revert");
        expect(updated!.isolationMode).toBe("shared");
        expect(updated!.connectionString).toBeNull();
        expect(updated!.driver).toBeNull();
    });

    it("setIsolation() on an unregistered tenant throws a clear error", async () => {
        const registry = new TenantRegistry(30_000);
        await expect(registry.setIsolation("ghost", { isolationMode: "dedicated" })).rejects.toThrow(/Unknown tenant: "ghost"/);
    });

    it("setMigrationStatus() persists and invalidates the cache", async () => {
        const registry = new TenantRegistry(30_000);
        await registry.register({ id: "reg-status", name: "Status Tenant" });
        await registry.find("reg-status");

        await registry.setMigrationStatus("reg-status", "copying_data");

        const updated = await registry.find("reg-status");
        expect(updated!.migrationStatus).toBe("copying_data");
    });
});
