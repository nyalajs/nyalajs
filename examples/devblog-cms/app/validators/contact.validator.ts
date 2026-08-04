import { z } from "zod";

export const ContactValidator = z.object({
    name: z.string().min(1, "Name is required").max(255),
    email: z.string().email("Invalid email"),
    message: z.string().min(1, "Message is required").max(5000),
});

export type ContactDto = z.infer<typeof ContactValidator>;
