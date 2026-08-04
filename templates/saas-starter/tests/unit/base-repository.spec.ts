import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { FakeDb } from "./fake-db";

// BaseRepository imports `db` from database/connection, which opens a real
// postgres connection at import time. Mock the module so this runs against
// the in-memory FakeDb instead — no live Postgres required.
const fakeDb = new FakeDb();
vi.mock("../../database/connection", () => ({
    db: {
        select: (...args: any[]) => fakeDb.select(...(args as [])),
        insert: (...args: any[]) => fakeDb.insert(...(args as [any])),
        update: (...args: any[]) => fakeDb.update(...(args as [any])),
        delete: (...args: any[]) => fakeDb.delete(...(args as [any])),
    },
}));

import { UserRepository } from "../../app/repositories/user.repository";
import { users } from "../../app/models/user.model";

describe("BaseRepository — tenant isolation (via UserRepository)", () => {
    let repo: UserRepository;

    beforeEach(() => {
        fakeDb.seed(users, []);
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
