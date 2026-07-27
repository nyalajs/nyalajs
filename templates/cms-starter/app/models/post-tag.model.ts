import { pgTable, uuid, primaryKey } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

/** Pivot table for the Post <-> Tag many-to-many relationship. */
export const postTags = pgTable(
    "post_tags",
    {
        postId: uuid("post_id").notNull(),
        tagId: uuid("tag_id").notNull(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.postId, table.tagId] }),
    })
);

export type PostTag = InferSelectModel<typeof postTags>;
export type NewPostTag = InferInsertModel<typeof postTags>;
