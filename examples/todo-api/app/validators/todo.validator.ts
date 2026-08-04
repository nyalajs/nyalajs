import { z } from "zod";

/**
 * Todo Validators
 *
 * Zod schemas for validating todo-related requests.
 * These are used with the @ValidateBody/@ValidateQuery decorators in controllers.
 */

export const CreateTodoValidator = z.object({
    title: z.string().min(1, "Title is required").max(255),
    description: z.string().max(2000).optional(),
    dueDate: z.coerce.date().optional(),
});

export const UpdateTodoValidator = z.object({
    title: z.string().min(1, "Title is required").max(255).optional(),
    description: z.string().max(2000).optional(),
    completed: z.boolean().optional(),
    dueDate: z.coerce.date().optional(),
});

export const TodoPaginationValidator = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
});
