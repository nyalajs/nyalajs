import { z } from "zod";

/**
 * Tenant Validators
 */

export const CreateTenantValidator = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    slug: z
        .string()
        .min(2)
        .max(100)
        .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    domain: z.string().max(255).optional(),
    plan: z.enum(["free", "starter", "pro", "enterprise"]).optional().default("free"),
});

export const UpdateTenantValidator = z.object({
    name: z.string().min(2).max(255).optional(),
    domain: z.string().max(255).optional(),
    plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
    isActive: z.boolean().optional(),
});
