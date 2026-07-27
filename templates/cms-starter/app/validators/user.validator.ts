import { z } from "zod";

export const CreateUserValidator = z.object({
    name: z.string().min(1, "Name is required").max(255),
    email: z.string().email("Invalid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["admin", "editor", "viewer"]),
});

export type CreateUserDto = z.infer<typeof CreateUserValidator>;
