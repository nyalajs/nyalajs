import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { users } from "./user.model";

/**
 * Posts table schema — the starter's one full CRUD resource (see
 * app/controllers/posts.controller.ts). Deliberately simple (title, body,
 * publish flag) so it stays a legible example of the Inertia round-trip
 * rather than a second demo of validation edge cases.
 */
export const posts = sqliteTable("posts", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    published: integer("published", { mode: "boolean" }).notNull().default(false),
    authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
