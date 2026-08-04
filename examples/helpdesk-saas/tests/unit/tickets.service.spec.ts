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

import { TicketsService } from "../../app/services/tickets.service";
import { TicketRepository } from "../../app/repositories/ticket.repository";
import { TicketCommentRepository } from "../../app/repositories/ticket-comment.repository";
import { tickets } from "../../app/models/ticket.model";
import { ticketComments } from "../../app/models/ticket-comment.model";

const noopLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

describe("TicketsService", () => {
    let service: TicketsService;

    beforeEach(() => {
        fakeDb.seed(tickets, []);
        fakeDb.seed(ticketComments, []);
        service = new TicketsService(new TicketRepository(), new TicketCommentRepository(), noopLogger);
    });

    it("creates a ticket defaulting status to open", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            expect((ticket as any).status).toBe("open");
            expect((ticket as any).createdById).toBe("user-a1");
        });
    });

    it("findOne() throws NotFoundException for a ticket outside the active tenant", async () => {
        let ticketId!: string;

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            ticketId = (ticket as any).id;
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            await expect(service.findOne(ticketId)).rejects.toThrow(/not found/i);
        });
    });

    it("updateStatus() changes the ticket's status within the tenant", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            const updated = await service.updateStatus((ticket as any).id, "in_progress");
            expect((updated as any).status).toBe("in_progress");
        });
    });

    it("assign() sets the assigned agent", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            const assigned = await service.assign((ticket as any).id, "agent-1");
            expect((assigned as any).assignedToId).toBe("agent-1");
        });
    });

    it("addComment()/listComments() round-trip within a tenant", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            await service.addComment((ticket as any).id, "Working on it", "agent-1");

            const comments = await service.listComments((ticket as any).id);
            expect(comments).toHaveLength(1);
            expect((comments[0] as any).body).toBe("Working on it");
        });
    });

    it("addComment() on another tenant's ticket throws NotFoundException", async () => {
        let ticketId!: string;

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            ticketId = (ticket as any).id;
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            await expect(service.addComment(ticketId, "Sneaky comment", "user-b1")).rejects.toThrow(/not found/i);
        });

        // And the comment must not have been written under tenant-a either.
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const comments = await service.listComments(ticketId);
            expect(comments).toHaveLength(0);
        });
    });

    it("delete() on another tenant's ticket throws NotFoundException and leaves it intact", async () => {
        let ticketId!: string;

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const ticket = await service.create({ subject: "Help", description: "desc" }, "user-a1");
            ticketId = (ticket as any).id;
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            await expect(service.delete(ticketId)).rejects.toThrow(/not found/i);
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const found = await service.findOne(ticketId);
            expect(found).toBeTruthy();
        });
    });

    it("findAll() paginates and filters within the active tenant only", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            await service.create({ subject: "A-open", description: "d" }, "u1");
            await service.create({ subject: "A-urgent", description: "d", priority: "urgent" as any }, "u1");
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            await service.create({ subject: "B-open", description: "d" }, "u2");
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const result = await service.findAll({ page: 1, limit: 10 });
            expect(result.data).toHaveLength(2);
            expect(result.pagination.total).toBe(2);
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            const result = await service.findAll({ page: 1, limit: 10 });
            expect(result.data).toHaveLength(1);
        });
    });
});
