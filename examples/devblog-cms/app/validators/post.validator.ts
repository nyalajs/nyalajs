import { z } from "zod";

export const PostValidator = z.object({
    title: z.string().min(1, "Title is required").max(255),
    slug: z
        .string()
        .min(1, "Slug is required")
        .max(255)
        .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    excerpt: z.string().optional().or(z.literal("")),
    content: z.string().min(1, "Content is required"),
    coverImageUrl: z.string().max(512).optional().or(z.literal("")),
    categoryId: z.string().optional().or(z.literal("")),
    status: z.enum(["draft", "published"]),
    metaTitle: z.string().max(255).optional().or(z.literal("")),
    metaDescription: z.string().optional().or(z.literal("")),
});

export type PostDto = z.infer<typeof PostValidator>;
