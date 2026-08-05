import { z } from "zod";

/** Same "hand-run via .safeParse()" reasoning as auth.validator.ts. */
export const PostValidator = z.object({
    title: z.string().min(1, "Title is required").max(255),
    body: z.string().min(1, "Body is required"),
    published: z.boolean().default(false),
});

export type PostDto = z.infer<typeof PostValidator>;
