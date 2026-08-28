import { Injectable } from "@nyalajs/core";
import { SchemaRegistry } from "@nyalajs/database";
import { eq } from "drizzle-orm";
import { Tenant } from "../models/tenant.model";
import { db } from "../../database/connection";

/**
 * Tenant Repository — deliberately bypasses Model's connection resolution
 * ENTIRELY (never calls Tenant.find()/.query()/.save()/etc.), always
 * querying this app's own shared `db` (from database/connection.ts)
 * directly instead.
 *
 * This matters specifically because of @nyalajs/tenancy's dedicated-per-
 * tenant routing: Model.connection() checks ConnectionContext before
 * falling back to the global pool, and TenantMiddleware sets
 * ConnectionContext to a tenant's OWN dedicated database for the rest of a
 * request once that tenant has been migrated (see TenantsService.
 * migrateToDedicated()). But a `tenants` row is registry/management data —
 * it describes a tenant, it doesn't belong TO one — and must always live
 * on the shared database, never inside any tenant's own dedicated
 * database (a dedicated tenant's own DB was never migrated to contain a
 * `tenants` table at all, on purpose). Going through Model here would
 * silently follow ConnectionContext into a dedicated tenant's database and
 * fail outright (no `tenants` table there). Confirmed against a real
 * request: TeamService.inviteMember()'s tenantRepository.findById() call,
 * made from within a request already routed to a dedicated connection,
 * threw exactly this way before this fix.
 *
 * Same reasoning as TenantRegistry itself (part of @nyalajs/tenancy) —
 * registry-shaped tables are structurally different from tenant-owned
 * data, and need their own connection story.
 */
@Injectable()
export class TenantRepository {
    private readonly table = SchemaRegistry.getTable(Tenant);

    private rowToTenant(row: any): Tenant {
        return Object.assign(new Tenant(), row);
    }

    async findById(id: string): Promise<Tenant | null> {
        const results = await db.select().from(this.table).where(eq(this.table.id, id)).limit(1);
        return results[0] ? this.rowToTenant(results[0]) : null;
    }

    async findBySlug(slug: string): Promise<Tenant | null> {
        const results = await db.select().from(this.table).where(eq(this.table.slug, slug)).limit(1);
        return results[0] ? this.rowToTenant(results[0]) : null;
    }

    async findByDomain(domain: string): Promise<Tenant | null> {
        const results = await db.select().from(this.table).where(eq(this.table.domain, domain)).limit(1);
        return results[0] ? this.rowToTenant(results[0]) : null;
    }

    async findActive(options?: { limit?: number; offset?: number }): Promise<Tenant[]> {
        let query: any = db.select().from(this.table).where(eq(this.table.isActive, true));
        if (options?.limit !== undefined) query = query.limit(options.limit);
        if (options?.offset !== undefined) query = query.offset(options.offset);
        const results = await query;
        return results.map((row: any) => this.rowToTenant(row));
    }

    async slugExists(slug: string): Promise<boolean> {
        const tenant = await this.findBySlug(slug);
        return tenant !== null;
    }

    async update(id: string, data: Partial<Tenant>): Promise<Tenant | null> {
        const results = await db
            .update(this.table)
            .set({ ...data, updatedAt: new Date() } as any)
            .where(eq(this.table.id, id))
            .returning();
        return results[0] ? this.rowToTenant(results[0]) : null;
    }

    async deactivate(id: string): Promise<Tenant | null> {
        return this.update(id, { isActive: false } as Partial<Tenant>);
    }

    async activate(id: string): Promise<Tenant | null> {
        return this.update(id, { isActive: true } as Partial<Tenant>);
    }

    async updatePlan(id: string, plan: string): Promise<Tenant | null> {
        return this.update(id, { plan } as Partial<Tenant>);
    }
}
