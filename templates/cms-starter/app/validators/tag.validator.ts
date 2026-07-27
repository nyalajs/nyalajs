import { z } from "zod";

export const TagValidator = z.object({
    name: z.string().min(1, "Name is required").max(255),
    slug: z
        .string()
        .min(1, "Slug is required")
        .max(255)
        .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
});

export type TagDto = z.infer<typeof TagValidator>;
