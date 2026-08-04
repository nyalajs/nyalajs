import { Injectable } from "@nyalajs/core";
import { eq, and } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { tickets, Ticket, TicketStatus, TicketPriority } from "../models/ticket.model";

/**
 * Ticket Repository (Tenant-Aware)
 *
 * All queries are automatically scoped to the current tenant.
 * Prevents cross-tenant data access.
 */
@Injectable()
export class TicketRepository extends BaseRepository<Ticket> {
    constructor() {
        super(tickets, true); // Tenant-aware
    }

    /**
     * Find tickets in the current tenant, optionally filtered by status/priority.
     */
    async findFiltered(options?: {
        status?: TicketStatus;
        priority?: TicketPriority;
        limit?: number;
        offset?: number;
    }): Promise<Ticket[]> {
        const conditions = [];
        if (options?.status) conditions.push(eq(tickets.status, options.status));
        if (options?.priority) conditions.push(eq(tickets.priority, options.priority));

        return this.findAll({
            limit: options?.limit,
            offset: options?.offset,
            where: conditions.length > 0 ? and(...conditions) : undefined,
        });
    }

    /**
     * Find tickets assigned to a given agent (within current tenant)
     */
    async findAssignedTo(userId: string): Promise<Ticket[]> {
        return this.findAll({ where: eq(tickets.assignedToId, userId) });
    }

    /**
     * Change ticket status
     */
    async updateStatus(id: string, status: TicketStatus): Promise<Ticket | null> {
        return this.update(id, { status } as Partial<Ticket>);
    }

    /**
     * Assign ticket to an agent (or unassign with null)
     */
    async assign(id: string, assignedToId: string | null): Promise<Ticket | null> {
        return this.update(id, { assignedToId } as Partial<Ticket>);
    }
}
