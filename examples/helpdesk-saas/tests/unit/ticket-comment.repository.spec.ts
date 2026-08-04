import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { FakeDb } from "./fake-db";

const fakeDb = new FakeDb();
vi.mock("../../database/connection", () => ({
    db: {
        select: (...args: any[]) => fakeDb.select(...(args as [])),
        insert: (...args: any[]) => fakeDb.insert(...(args as [any])),
        update: (...args: any[]) => fakeDb.update(...(args as [any])),
        delete: (...args: any[]) => fakeDb.delete(...(args as [any])),
    },
}));

import { TicketCommentRepository } from "../../app/repositories/ticket-comment.repository";
import { ticketComments } from "../../app/models/ticket-comment.model";

describe("TicketCommentRepository (tenant isolation)", () => {
    let repo: TicketCommentRepository;

    beforeEach(() => {
        fakeDb.seed(ticketComments, []);
        repo = new TicketCommentRepository();
    });

    it("fails closed without an active tenant", async () => {
        await expect(repo.findByTicket("ticket-1")).rejects.toThrow(/Tenant context required/);
        await expect(
            repo.create({ ticketId: "ticket-1", authorId: "u1", body: "hi" } as any),
        ).rejects.toThrow(/Tenant context required/);
    });

    it("comments created under tenant A are invisible to tenant B", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            await repo.create({ ticketId: "ticket-1", authorId: "user-a1", body: "Looking into it" } as any);
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const comments = await repo.findByTicket("ticket-1");
            expect(comments).toHaveLength(1);
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            const comments = await repo.findByTicket("ticket-1");
            expect(comments).toHaveLength(0);
        });
    });

    it("create() auto-stamps tenant_id", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const comment = await repo.create({
                ticketId: "ticket-1",
                authorId: "user-a1",
                body: "First reply",
            } as any);
            expect((comment as any).tenantId).toBe("tenant-a");
            expect((comment as any).body).toBe("First reply");
        });
    });
});
