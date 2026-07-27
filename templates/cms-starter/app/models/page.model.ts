import { pgTable, uuid, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export interface PageBlock {
    type: string;
    data: Record<string, any>;
}

/**
 * Static/marketing pages (About, Contact, Home, ...). `blocks` is a
 * typed-but-loose array the public block-renderer (app/views/blocks/)
 * maps over — unrecognized block types render nothing rather than crash.
 */
export const pages = pgTable("pages", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    blocks: jsonb("blocks").notNull().default("[]"),
    metaTitle: varchar("meta_title", { length: 255 }),
    metaDescription: text("meta_description"),
    ogImage: varchar("og_image", { length: 512 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // "draft" | "published"
    authorId: uuid("author_id").notNull(),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Page = Omit<InferSelectModel<typeof pages>, "blocks"> & { blocks: PageBlock[] };
export type NewPage = InferInsertModel<typeof pages>;
