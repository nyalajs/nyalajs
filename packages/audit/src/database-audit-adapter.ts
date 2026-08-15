import { and, eq, gte, lte, SQL } from "drizzle-orm";
import { AuditStorage } from "./audit-logger";
import { AuditEvent } from "./audit-event";
import { AuditQueryCriteria } from "./audit-query-criteria";

/**
 * Persists audit logs to a relational database using Drizzle ORM.
 * Requires the table `audit_logs` to exist in the database.
 */
export class DatabaseAuditAdapter implements AuditStorage {
    constructor(private readonly db: any, private readonly tableName: string = "audit_logs") {}

    async save(event: AuditEvent): Promise<void> {
        try {
            await this.db.insert(this.db._schema[this.tableName] || this.db._schema.auditLogs).values({
                id: event.id,
                action: event.action,
                resourceType: event.resourceType,
                resourceId: event.resourceId,
                tenantId: event.tenantId,
                actorId: event.actorId,
                metadata: event.metadata,
                ip: event.ip,
                userAgent: event.userAgent,
                timestamp: event.timestamp,
            });
        } catch (error) {
            console.error("Failed to persist audit log to database:", error);
            // We intentionally do not throw here to prevent application crashes
            // due to audit logging failures.
        }
    }

    async query(criteria: AuditQueryCriteria = {}): Promise<AuditEvent[]> {
        const table = this.db._schema[this.tableName] || this.db._schema.auditLogs;

        // `table` is a caller-supplied Drizzle table with whatever column
        // set they defined for save() — build the where clause only from
        // criteria fields that have a matching column, rather than
        // assuming every AuditEvent field exists on every schema.
        const conditions: SQL[] = [];
        if (criteria.action !== undefined && table.action) conditions.push(eq(table.action, criteria.action));
        if (criteria.resourceType !== undefined && table.resourceType) conditions.push(eq(table.resourceType, criteria.resourceType));
        if (criteria.resourceId !== undefined && table.resourceId) conditions.push(eq(table.resourceId, criteria.resourceId));
        if (criteria.tenantId !== undefined && table.tenantId) conditions.push(eq(table.tenantId, criteria.tenantId));
        if (criteria.actorId !== undefined && table.actorId) conditions.push(eq(table.actorId, criteria.actorId));
        if (criteria.from !== undefined && table.timestamp) conditions.push(gte(table.timestamp, criteria.from));
        if (criteria.to !== undefined && table.timestamp) conditions.push(lte(table.timestamp, criteria.to));

        let query = this.db.select().from(table);
        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }
        if (criteria.limit !== undefined) {
            query = query.limit(criteria.limit);
        }

        return await query;
    }
}
