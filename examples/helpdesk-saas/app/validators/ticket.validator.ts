import { z } from "zod";

/**
 * Ticket Validators
 *
 * Zod schemas for validating ticket-related requests.
 */

export const TicketStatusEnum = z.enum(["open", "in_progress", "resolved", "closed"]);
export const TicketPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);

export const CreateTicketValidator = z.object({
    subject: z.string().min(3, "Subject must be at least 3 characters").max(255),
    description: z.string().min(1, "Description is required"),
    priority: TicketPriorityEnum.optional().default("medium"),
});

export const UpdateTicketValidator = z.object({
    subject: z.string().min(3).max(255).optional(),
    description: z.string().min(1).optional(),
    priority: TicketPriorityEnum.optional(),
});

export const UpdateTicketStatusValidator = z.object({
    status: TicketStatusEnum,
});

export const AssignTicketValidator = z.object({
    assignedToId: z.string().uuid("assignedToId must be a valid UUID").nullable(),
});

export const CreateTicketCommentValidator = z.object({
    body: z.string().min(1, "Comment body is required"),
});

export const TicketFilterValidator = z.object({
    status: TicketStatusEnum.optional(),
    priority: TicketPriorityEnum.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
});
