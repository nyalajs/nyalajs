import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

export const auditLogs = pgTable("audit_logs", {
    id: uuid("id").primaryKey(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    tenantId: uuid("tenant_id"),
    actorId: uuid("actor_id"),
    actorType: text("actor_type"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    status: text("status").notNull(), // success, failure
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
});
