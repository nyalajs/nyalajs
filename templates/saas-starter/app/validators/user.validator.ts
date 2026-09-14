import { z } from "zod";

/**
 * User Validators
 *
 * Zod schemas for validating user-related requests. Role names
 * (owner/admin/member) match the convention @nyalajs/permissions roles are
 * seeded with for every tenant — see AuthService.register() (creates the
 * "owner" role) and TeamService.acceptInvite() (creates whatever role the
 * invite specified, "admin" or "member").
 */

export const CreateUserValidator = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    email: z.string().email("Invalid email format").max(255),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
    role: z.enum(["admin", "member"]).optional().default("member"),
});

export const UpdateUserValidator = z.object({
    name: z.string().min(2).max(255).optional(),
    email: z.string().email().max(255).optional(),
    role: z.enum(["admin", "member"]).optional(),
});

export const PaginationValidator = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
});
