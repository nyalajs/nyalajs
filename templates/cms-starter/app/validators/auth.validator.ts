import { z } from "zod";

export const LoginValidator = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
});

export type LoginDto = z.infer<typeof LoginValidator>;
