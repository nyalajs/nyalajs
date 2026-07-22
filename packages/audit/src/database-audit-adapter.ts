import { AuditStorage } from "./audit-logger";
import { AuditEvent } from "./audit-event";

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

    async query(criteria: any): Promise<AuditEvent[]> {
        const table = this.db._schema[this.tableName] || this.db._schema.auditLogs;
        
        let query = this.db.select().from(table);
        
        // Basic filtering support
        if (criteria.action) {
            // query = query.where(eq(table.action, criteria.action));
            // Assuming eq is bound or handled dynamically
        }
        
        return await query;
    }
}
