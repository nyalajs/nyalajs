import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { ticketComments, TicketComment } from "../models/ticket-comment.model";

/**
 * Ticket Comment Repository (Tenant-Aware)
 *
 * All queries are automatically scoped to the current tenant.
 * Prevents cross-tenant data access.
 */
@Injectable()
export class TicketCommentRepository extends BaseRepository<TicketComment> {
    constructor() {
        super(ticketComments, true); // Tenant-aware
    }

    /**
     * Find all comments for a ticket (within current tenant), oldest first.
     */
    async findByTicket(ticketId: string): Promise<TicketComment[]> {
        return this.findAll({ where: eq(ticketComments.ticketId, ticketId) });
    }
}
