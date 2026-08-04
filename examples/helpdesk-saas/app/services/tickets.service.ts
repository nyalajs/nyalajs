import { Injectable } from "@nyalajs/core";
import { NotFoundException } from "@nyalajs/http";
import { Logger } from "@nyalajs/observability";
import { TicketRepository } from "../repositories/ticket.repository";
import { TicketCommentRepository } from "../repositories/ticket-comment.repository";
import { TicketStatus, TicketPriority } from "../models/ticket.model";

interface CreateTicketDto {
    subject: string;
    description: string;
    priority?: TicketPriority;
}

interface UpdateTicketDto {
    subject?: string;
    description?: string;
    priority?: TicketPriority;
}

interface ListFilters {
    status?: TicketStatus;
    priority?: TicketPriority;
    page: number;
    limit: number;
}

/**
 * Tickets Service
 *
 * All reads/writes go through TicketRepository/TicketCommentRepository,
 * which are tenant-aware (see app/repositories/base.repository.ts): every
 * query is automatically scoped to the tenant active on TenantContext for
 * the current request, and cross-tenant access is impossible by construction.
 */
@Injectable()
export class TicketsService {
    constructor(
        private tickets: TicketRepository,
        private comments: TicketCommentRepository,
        private logger: Logger,
    ) { }

    async findAll(filters: ListFilters) {
        this.logger.info("Listing tickets", filters);

        const offset = (filters.page - 1) * filters.limit;
        const [data, total] = await Promise.all([
            this.tickets.findFiltered({
                status: filters.status,
                priority: filters.priority,
                limit: filters.limit,
                offset,
            }),
            this.tickets.count(),
        ]);

        return {
            data,
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total,
                totalPages: Math.ceil(total / filters.limit) || 1,
            },
        };
    }

    async findOne(id: string) {
        const ticket = await this.tickets.findById(id);
        if (!ticket) {
            throw new NotFoundException(`Ticket ${id} not found`);
        }
        return ticket;
    }

    async create(dto: CreateTicketDto, createdById: string) {
        this.logger.info("Creating ticket", { subject: dto.subject });

        return this.tickets.create({
            subject: dto.subject,
            description: dto.description,
            priority: dto.priority ?? "medium",
            status: "open",
            createdById,
        } as any);
    }

    async update(id: string, dto: UpdateTicketDto) {
        const updated = await this.tickets.update(id, dto as any);
        if (!updated) {
            throw new NotFoundException(`Ticket ${id} not found`);
        }
        return updated;
    }

    async updateStatus(id: string, status: TicketStatus) {
        const updated = await this.tickets.updateStatus(id, status);
        if (!updated) {
            throw new NotFoundException(`Ticket ${id} not found`);
        }
        return updated;
    }

    async assign(id: string, assignedToId: string | null) {
        const updated = await this.tickets.assign(id, assignedToId);
        if (!updated) {
            throw new NotFoundException(`Ticket ${id} not found`);
        }
        return updated;
    }

    async delete(id: string) {
        const deleted = await this.tickets.delete(id);
        if (!deleted) {
            throw new NotFoundException(`Ticket ${id} not found`);
        }
        return { message: `Ticket ${id} deleted successfully` };
    }

    async addComment(ticketId: string, body: string, authorId: string) {
        // Ensure the ticket exists (and belongs to the current tenant) before
        // attaching a comment to it.
        await this.findOne(ticketId);

        return this.comments.create({
            ticketId,
            authorId,
            body,
        } as any);
    }

    async listComments(ticketId: string) {
        // Ensure the ticket exists (and belongs to the current tenant) before
        // listing its comments.
        await this.findOne(ticketId);

        return this.comments.findByTicket(ticketId);
    }
}
