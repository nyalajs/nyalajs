import { z } from "zod";

export const PageValidator = z.object({
    title: z.string().min(1, "Title is required").max(255),
    slug: z
        .string()
        .min(1, "Slug is required")
        .max(255)
        .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    status: z.enum(["draft", "published"]),
    blocksJson: z.string().refine((value) => {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed);
        } catch {
            return false;
        }
    }, "Blocks must be valid JSON array"),
    metaTitle: z.string().max(255).optional().or(z.literal("")),
    metaDescription: z.string().optional().or(z.literal("")),
    ogImage: z.string().max(512).optional().or(z.literal("")),
});

export type PageDto = z.infer<typeof PageValidator>;
