import { eq, SQL } from "drizzle-orm";
import { SchemaRegistry } from "../schema/registry";

/**
 * Utility to generate the WHERE clause for tenant isolation.
 * The TenantRepository or global scope middleware will use this to automatically
 * append `WHERE tenant_id = ?` to all Drizzle queries.
 */
export class TenantScope {
    static getScope(modelClass: any, tenantId: string): SQL | undefined {
        const table = SchemaRegistry.getTable(modelClass);
        
        // If the table has a tenantId column, return the equality condition.
        if (table.tenantId) {
            return eq(table.tenantId, tenantId);
        }
        
        return undefined;
    }
}
