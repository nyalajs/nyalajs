import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { tenants } from "./tenant.model";
import { users } from "./user.model";

/**
 * Tickets table schema
 *
 * Multi-tenant support tickets - each ticket belongs to a tenant.
 * Tenant isolation is enforced at the repository layer.
 */
export const tickets = pgTable("tickets", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    priority: varchar("priority", { length: 20 }).default("medium").notNull(),
    createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Ticket = InferSelectModel<typeof tickets>;
export type NewTicket = InferInsertModel<typeof tickets>;

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
