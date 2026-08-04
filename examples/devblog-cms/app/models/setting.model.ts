import { pgTable, varchar, jsonb } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * Site-wide key/value settings — siteName, siteDescription, logoUrl,
 * faviconUrl, socialLinks, contactEmail, footerText, maintenanceMode, ...
 * `value` is jsonb so a setting can hold a string, object, or array.
 */
export const settings = pgTable("settings", {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: jsonb("value").notNull(),
});

export type Setting = InferSelectModel<typeof settings>;
export type NewSetting = InferInsertModel<typeof settings>;
