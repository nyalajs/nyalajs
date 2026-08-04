import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { FakeDb } from "./fake-db";

// BaseRepository imports `db` from database/connection, which opens a real
// postgres connection at import time. Mock the module so these tests run
// against the in-memory FakeDb instead — no live Postgres required.
const fakeDb = new FakeDb();
vi.mock("../../database/connection", () => ({
    db: {
        select: (...args: any[]) => fakeDb.select(...(args as [])),
        insert: (...args: any[]) => fakeDb.insert(...(args as [any])),
        update: (...args: any[]) => fakeDb.update(...(args as [any])),
        delete: (...args: any[]) => fakeDb.delete(...(args as [any])),
    },
}));

import { TicketRepository } from "../../app/repositories/ticket.repository";
import { tickets } from "../../app/models/ticket.model";

describe("TicketRepository (tenant isolation)", () => {
    let repo: TicketRepository;

    beforeEach(() => {
        fakeDb.seed(tickets, []);
        repo = new TicketRepository();
    });

    describe("without an active tenant — fails closed", () => {
        it("findAll() rejects", async () => {
            await expect(repo.findAll()).rejects.toThrow(/Tenant context required/);
        });

        it("findById() rejects", async () => {
            await expect(repo.findById("some-id")).rejects.toThrow(/Tenant context required/);
        });

        it("create() rejects", async () => {
            await expect(
                repo.create({ subject: "hi", description: "desc", createdById: "u1" } as any),
            ).rejects.toThrow(/Tenant context required/);
        });
    });

    describe("cross-tenant isolation", () => {
        it("a ticket created under tenant A is invisible to tenant B", async () => {
            let ticketId!: string;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const created = await repo.create({
                    subject: "Cannot log in",
                    description: "500 error on login",
                    createdById: "user-a1",
                } as any);
                ticketId = (created as any).id;
                expect((created as any).tenantId).toBe("tenant-a");
            });

            // Tenant A can read its own ticket.
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const found = await repo.findById(ticketId);
                expect(found).not.toBeNull();
                expect((found as any).subject).toBe("Cannot log in");
            });

            // Tenant B cannot see it via findById.
            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                const found = await repo.findById(ticketId);
                expect(found).toBeNull();
            });

            // Tenant B cannot see it via findAll either.
            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                const all = await repo.findAll();
                expect(all).toHaveLength(0);
            });
        });

        it("tenant B cannot update tenant A's ticket", async () => {
            let ticketId!: string;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const created = await repo.create({
                    subject: "Original subject",
                    description: "desc",
                    createdById: "user-a1",
                } as any);
                ticketId = (created as any).id;
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                const updated = await repo.update(ticketId, { subject: "Hijacked" } as any);
                expect(updated).toBeNull();
            });

            // Confirm tenant A's copy is untouched.
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const found = await repo.findById(ticketId);
                expect((found as any).subject).toBe("Original subject");
            });
        });

        it("tenant B cannot delete tenant A's ticket", async () => {
            let ticketId!: string;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const created = await repo.create({
                    subject: "Should survive",
                    description: "desc",
                    createdById: "user-a1",
                } as any);
                ticketId = (created as any).id;
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                const deleted = await repo.delete(ticketId);
                expect(deleted).toBe(false);
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const found = await repo.findById(ticketId);
                expect(found).not.toBeNull();
            });
        });

        it("findAll() only returns the active tenant's tickets even when multiple tenants have data", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                await repo.create({ subject: "A1", description: "d", createdById: "u1" } as any);
                await repo.create({ subject: "A2", description: "d", createdById: "u1" } as any);
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                await repo.create({ subject: "B1", description: "d", createdById: "u2" } as any);
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const all = await repo.findAll();
                expect(all).toHaveLength(2);
                expect(all.every((t: any) => t.tenantId === "tenant-a")).toBe(true);
            });

            await TenantContext.run(async () => {
                TenantContext.set("tenant-b");
                const all = await repo.findAll();
                expect(all).toHaveLength(1);
                expect((all[0] as any).tenantId).toBe("tenant-b");
            });
        });
    });

    describe("with an active tenant — normal CRUD", () => {
        it("create() auto-stamps tenant_id and defaults", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const ticket = await repo.create({
                    subject: "New ticket",
                    description: "desc",
                    status: "open",
                    priority: "medium",
                    createdById: "user-a1",
                } as any);
                expect((ticket as any).tenantId).toBe("tenant-a");
                expect((ticket as any).status).toBe("open");
            });
        });

        it("updateStatus() changes status", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const created = await repo.create({
                    subject: "Ticket",
                    description: "desc",
                    status: "open",
                    createdById: "user-a1",
                } as any);

                const updated = await repo.updateStatus((created as any).id, "resolved");
                expect((updated as any).status).toBe("resolved");
            });
        });

        it("assign() sets assignedToId", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const created = await repo.create({
                    subject: "Ticket",
                    description: "desc",
                    createdById: "user-a1",
                } as any);

                const assigned = await repo.assign((created as any).id, "agent-1");
                expect((assigned as any).assignedToId).toBe("agent-1");
            });
        });

        it("findFiltered() filters by status and priority within the tenant", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                await repo.create({
                    subject: "Open high",
                    description: "d",
                    status: "open",
                    priority: "high",
                    createdById: "u1",
                } as any);
                await repo.create({
                    subject: "Closed low",
                    description: "d",
                    status: "closed",
                    priority: "low",
                    createdById: "u1",
                } as any);

                const openOnly = await repo.findFiltered({ status: "open" as any });
                expect(openOnly).toHaveLength(1);
                expect((openOnly[0] as any).subject).toBe("Open high");

                const highOnly = await repo.findFiltered({ priority: "high" as any });
                expect(highOnly).toHaveLength(1);
            });
        });
    });
});
