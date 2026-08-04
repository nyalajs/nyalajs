import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { tenants } from "./tenant.model";

/**
 * Users table schema
 *
 * Multi-tenant users - each user belongs to a tenant.
 * Tenant isolation is enforced at the repository layer.
 */
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).default("user").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    emailVerifiedAt: timestamp("email_verified_at"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
