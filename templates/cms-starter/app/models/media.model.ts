import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const media = pgTable("media", {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: varchar("filename", { length: 255 }).notNull(),
    url: varchar("url", { length: 1024 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    altText: varchar("alt_text", { length: 255 }),
    uploadedById: uuid("uploaded_by_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Media = InferSelectModel<typeof media>;
export type NewMedia = InferInsertModel<typeof media>;
