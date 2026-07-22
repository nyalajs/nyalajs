import { z } from "zod";

/**
 * User Validators
 *
 * Zod schemas for validating user-related requests.
 * These are used with the @UseValidation decorator in controllers.
 */

export const CreateUserValidator = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    email: z.string().email("Invalid email format").max(255),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password muinValidator = z.object({
    email: z.string().email("Invalid email format"),
            password: z.string().min(1, "Password is required"),
});

export const PaginationValidator = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
});
