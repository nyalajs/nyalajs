import { z } from "zod";

/**
 * User Validators
 *
 * Zod schemas for validating user-related requests.
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
    role: z.enum(["user", "admin", "superadmin"]).optional().default("user"),
    isActive: z.boolean().optional().default(true),
});

export const UpdateUserValidator = z.object({
    name: z.string().min(2).max(255).optional(),
    email: z.string().email().max(255).optional(),
    password: z
        .string()
        .min(8)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/)
        .optional(),
    role: z.enum(["user", "admin", "superadmin"]).optional(),
    isActive: z.boolean().optional(),
});

export const LoginValidator = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
    tenantSlug: z.string().optional(),
});

export const PaginationValidator = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
});
