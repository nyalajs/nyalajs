import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const posts = pgTable("posts", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    coverImageUrl: varchar("cover_image_url", { length: 512 }),
    categoryId: uuid("category_id"),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // "draft" | "published"
    authorId: uuid("author_id").notNull(),
    publishedAt: timestamp("published_at"),
    metaTitle: varchar("meta_title", { length: 255 }),
    metaDescription: text("meta_description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
