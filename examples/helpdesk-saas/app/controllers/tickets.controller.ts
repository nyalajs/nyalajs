import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Inject, UseGuards } from "@nyalajs/core";
import { RequestContext } from "@nyalajs/http";
import { TicketsService } from "../services/tickets.service";
import { AuthGuard } from "@nyalajs/security";
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

interface UpdateStatusDto {
    status: TicketStatus;
}

interface AssignDto {
    assignedToId: string | null;
}

interface CreateCommentDto {
    body: string;
}

/**
 * Tickets Controller
 *
 * Every route requires an authenticated (JWT) request. AuthGuard verifies
 * the token; JwtTenantResolver (global middleware, see bootstrap/app.module.ts)
 * independently resolves the tenant from the same token and publishes it via
 * TenantContext, which TicketRepository/TicketCommentRepository read to
 * enforce tenant isolation. Without a valid token there is no tenant, and
 * without a tenant every repository call throws — so ticket data is only
 * ever reachable within its owning tenant.
 */
@Controller("/tickets")
@UseGuards(AuthGuard)
export class TicketsController {
    constructor(
        private ticketsService: TicketsService,
        @Inject("REQUEST_CONTEXT") private requestContext: RequestContext,
    ) { }

    @Get("/")
    async findAll(
        @Query("status") status?: TicketStatus,
        @Query("priority") priority?: TicketPriority,
        @Query("page") page: number = 1,
        @Query("limit") limit: number = 10,
    ) {
        return this.ticketsService.findAll({ status, priority, page, limit });
    }

    @Get("/:id")
    async findOne(@Param("id") id: string) {
        return this.ticketsService.findOne(id);
    }

    @Post("/")
    async create(@Body() dto: CreateTicketDto) {
        return this.ticketsService.create(dto, this.currentUserId());
    }

    @Put("/:id")
    async update(@Param("id") id: string, @Body() dto: UpdateTicketDto) {
        return this.ticketsService.update(id, dto);
    }

    @Patch("/:id/status")
    async updateStatus(@Param("id") id: string, @Body() dto: UpdateStatusDto) {
        return this.ticketsService.updateStatus(id, dto.status);
    }

    @Patch("/:id/assign")
    async assign(@Param("id") id: string, @Body() dto: AssignDto) {
        return this.ticketsService.assign(id, dto.assignedToId);
    }

    @Delete("/:id")
    async delete(@Param("id") id: string) {
        return this.ticketsService.delete(id);
    }

    @Post("/:id/comments")
    async addComment(@Param("id") id: string, @Body() dto: CreateCommentDto) {
        return this.ticketsService.addComment(id, dto.body, this.currentUserId());
    }

    @Get("/:id/comments")
    async listComments(@Param("id") id: string) {
        return this.ticketsService.listComments(id);
    }

    private currentUserId(): string {
        const userId = this.requestContext.userId;
        if (!userId) {
            throw new Error("No authenticated user on the current request context");
        }
        return userId;
    }
}
