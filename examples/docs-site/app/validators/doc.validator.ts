import { z } from "zod";

/** Same "hand-run via .safeParse() in the controller, not @ValidateBody" reasoning as inertia-starter's validators. */
export const DocValidator = z.object({
    slug: z
        .string()
        .min(1, "Slug is required")
        .max(255)
        .regex(/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, - and / only (e.g. building-blocks/controllers)"),
    title: z.string().min(1, "Title is required").max(255),
    groupTitle: z.string().min(1, "Group is required").max(255),
    sortOrder: z.coerce.number().int().default(0),
    content: z.string().min(1, "Content is required"),
});

export type DocDto = z.infer<typeof DocValidator>;
