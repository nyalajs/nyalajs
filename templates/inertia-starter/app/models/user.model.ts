import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * Users table schema
 *
 * SQLite (via better-sqlite3/drizzle-orm/sqlite-core) — matches
 * config/database.ts's default driver, chosen so this starter runs with
 * zero external services. IDs are plain text (crypto.randomUUID() at
 * insert time, in UserRepository) rather than a DB-generated UUID —
 * SQLite has no native uuid type/default the way pg-core's
 * `.defaultRandom()` does.
 */
export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Type inference for TypeScript
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
