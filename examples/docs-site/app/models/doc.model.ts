import { mysqlTable, varchar, int, text, timestamp } from "drizzle-orm/mysql-core";
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
 *
 * MySQL dialect (drizzle-orm/mysql-core) — `slug` is `varchar(255)`, not
 * `text`, because MySQL can't put a unique index on an unbounded TEXT
 * column without an explicit key-length prefix; every other string column
 * that isn't uniquely indexed stays `text` for real, unbounded markdown
 * content.
 */
export const docs = mysqlTable("docs", {
    id: varchar("id", { length: 36 }).primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    groupTitle: varchar("group_title", { length: 255 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
});

export type Doc = InferSelectModel<typeof docs>;
export type NewDoc = InferInsertModel<typeof docs>;
