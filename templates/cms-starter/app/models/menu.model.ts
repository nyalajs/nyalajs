import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const menus = pgTable("menus", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    location: varchar("location", { length: 20 }).notNull(), // "header" | "footer"
});

export type Menu = InferSelectModel<typeof menus>;
export type NewMenu = InferInsertModel<typeof menus>;
