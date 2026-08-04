import { pgTable, uuid, varchar, integer } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const menuItems = pgTable("menu_items", {
    id: uuid("id").primaryKey().defaultRandom(),
    menuId: uuid("menu_id").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    url: varchar("url", { length: 512 }), // custom URL — mutually exclusive with pageId
    pageId: uuid("page_id"), // link to a Page instead of a raw URL
    order: integer("order").notNull().default(0),
    parentId: uuid("parent_id"), // for nested menus
});

export type MenuItem = InferSelectModel<typeof menuItems>;
export type NewMenuItem = InferInsertModel<typeof menuItems>;
