import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { Model, SchemaRegistry } from "@nyalajs/database";
import { FakeDb } from "./fake-db";

// UserRepository's methods go through User (a @nyalajs/database Model),
// whose Model.connection() reads Model.db as its fallback (no
// ConnectionContext/TransactionContext active in these tests) — pointing
// that at an in-memory FakeDb exercises BaseRepository's real tenant-scoping
// logic (delegated to Model itself) without a live Postgres connection.
const fakeDb = new FakeDb();
Model.setDatabase(fakeDb as any);

import { UserRepository } from "../../app/repositories/user.repository";
import { User } from "../../app/models/user.model";

describe("BaseRepository — tenant isolation (via UserRepository)", () => {
    let repo: UserRepository;

    beforeEach(() => {
        const table = SchemaRegistry.getTable(User);
        fakeDb.seed(table, []);
        repo = new UserRepository();
    });

    describe("without an active tenant — every method fails closed", () => {
        it("findAll() rejects", async () => {
            await expect(repo.findAll()).rejects.toThrow(/Tenant context required/);
        });

        it("findById() rejects", async () => {
            await expect(repo.findById("some-id")).rejects.toThrow(/Tenant context required/);
        });

        it("create() rejects — regression test: this used to silently write tenantId=undefined instead of throwing", async () => {
            await expect(
                repo.create({ name: "No Tenant", email: "no-tenant@example.com", password: "x" } as any)
            ).rejects.toThrow(/Tenant context required/);
        });
    });

    describe("cross-tenant isolation", () => {
        it("a user created under tenant A is invisible to tenant B, and carries the right tenantId", async () => {
            let userId!: string;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const created = await repo.create({
                    name: "Alice",
                    email: "alice@example.com",
                    password: "hashed",
                } as any);
                userId = created.id;
                expect((created as any).tenantId).toBe("tenant-a");
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const found = await repo.findById(userId);
                expect(found?.email).toBe("alice@example.com");
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                const found = await repo.findById(userId);
                expect(found).toBeNull();
            });
        });
    });
});
