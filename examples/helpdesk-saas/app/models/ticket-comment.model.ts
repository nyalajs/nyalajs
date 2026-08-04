import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { tenants } from "./tenant.model";
import { users } from "./user.model";
import { tickets } from "./ticket.model";

/**
 * Ticket comments table schema
 *
 * Multi-tenant ticket comments - each comment belongs to a tenant and a
 * ticket. Tenant isolation is enforced at the repository layer.
 */
export const ticketComments = pgTable("ticket_comments", {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TicketComment = InferSelectModel<typeof ticketComments>;
export type NewTicketComment = InferInsertModel<typeof ticketComments>;
