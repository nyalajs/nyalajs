import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * Docs table — the real content source for this app. Replaces reading
 * website/docs/*.md off disk at request time: `content` here is the same
 * raw markdown those files held (seeded in from them — see
 * database/seeders/doc.seeder.ts), but now it's a real, mutable database
 * row a controller can create/update/delete, not a read-only file.
 * `slug` is the URL (/docs/:slug) and the unique lookup key, matching the
 * file-based version's `${slug}.md` convention. `groupTitle`/`sortOrder`
 * reproduce the grouped-sidebar-nav structure the old app/docs/nav.ts data
 * file hardcoded, but as real per-row data instead.
 */
export const docs = sqliteTable("docs", {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    groupTitle: text("group_title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type Doc = InferSelectModel<typeof docs>;
export type NewDoc = InferInsertModel<typeof docs>;
