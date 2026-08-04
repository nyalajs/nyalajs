import { Injectable, TenantContext } from "@nyalajs/core";
import { eq, and, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../database/connection";

/**
 * Tenant-Aware Base Repository
 *
 * Automatically filters queries by tenant_id for multi-tenant isolation.
 * The current tenant comes from TenantContext (request-scoped, set by
 * TenantMiddleware — see config/middleware.ts) rather than a field on this
 * repository: this class is a DI singleton, so storing the tenant on `this`
 * would leak one request's tenant into concurrent requests. Fails closed:
 * a tenant-aware repository queried with no active tenant throws instead of
 * silently returning every tenant's rows.
 *
 * @example
 * export class UserRepository extends BaseRepository<User> {
 *     constructor() {
 *         super(users, true); // Enable tenant awareness
 *     }
 * }
 */
@Injectable()
export abstract class BaseRepository<T> {
    constructor(
        protected readonly table: PgTable,
        protected readonly isTenantAware: boolean = true
    ) { }

    /**
     * The active tenant filter, or undefined if this repository isn't
     * tenant-aware. Throws if it IS tenant-aware but no tenant is active —
     * the same fail-closed policy @nyalajs/database's Model enforces.
     */
    protected requireTenantFilter(): SQL | undefined {
        if (!this.isTenantAware) return undefined;

        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new Error(
                "Tenant context required: this repository is tenant-aware but no tenant is active for the " +
                "current request. Ensure TenantMiddleware runs before this repository is used, or construct " +
                "with isTenantAware=false for tenant-management operations (e.g. TenantRepository itself)."
            );
        }

        return eq((this.table as any).tenantId, tenantId);
    }

    /** Current tenant ID, or undefined for a non-tenant-aware repository. */
    protected getTenantId(): string | undefined {
        return this.isTenantAware ? TenantContext.get() : undefined;
    }

    /**
     * Add tenant filter to where clause.
     */
    protected withTenantFilter(where?: SQL): SQL {
        const tenantFilter = this.requireTenantFilter();
        if (!tenantFilter) return where || (undefined as any);
        return where ? (and(tenantFilter, where) as SQL) : tenantFilter;
    }

    /**
     * Find all records (tenant-scoped)
     */
    async findAll(options?: {
        limit?: number;
        offset?: number;
        where?: SQL;
    }): Promise<T[]> {
        let query = db.select().from(this.table);

        const whereClause = this.withTenantFilter(options?.where);
        if (whereClause) {
            query = query.where(whereClause) as any;
        }

        if (options?.limit) {
            query = query.limit(options.limit) as any;
        }

        if (options?.offset) {
            query = query.offset(options.offset) as any;
        }

        return query as Promise<T[]>;
    }

    /**
     * Find record by ID (tenant-scoped)
     */
    async findById(id: string): Promise<T | null> {
        const tenantFilter = this.requireTenantFilter();
        const where = tenantFilter ? and(eq((this.table as any).id, id), tenantFilter) : eq((this.table as any).id, id);

        const results = await db
            .select()
            .from(this.table)
            .where(where as SQL)
            .limit(1);

        return (results[0] as T) || null;
    }

    /**
     * Find one record (tenant-scoped)
     */
    async findOne(where: SQL): Promise<T | null> {
        const results = await db
            .select()
            .from(this.table)
            .where(this.withTenantFilter(where))
            .limit(1);

        return (results[0] as T) || null;
    }

    /**
     * Create a new record (auto-adds tenant_id)
     */
    async create(data: Partial<T>): Promise<T> {
        const tenantId = this.getTenantId();

        const recordData = this.isTenantAware
            ? ({ ...data, tenantId } as any)
            : data;

        const results = await db
            .insert(this.table)
            .values(recordData)
            .returning();

        return results[0] as T;
    }

    /**
     * Update record by ID (tenant-scoped)
     */
    async update(id: string, data: Partial<T>): Promise<T | null> {
        const tenantFilter = this.requireTenantFilter();
        const where = tenantFilter ? and(eq((this.table as any).id, id), tenantFilter) : eq((this.table as any).id, id);

        const results = await db
            .update(this.table)
            .set({ ...data, updatedAt: new Date() } as any)
            .where(where as SQL)
            .returning();

        return (results[0] as T) || null;
    }

    /**
     * Delete record by ID (tenant-scoped)
     */
    async delete(id: string): Promise<boolean> {
        const tenantFilter = this.requireTenantFilter();
        const where = tenantFilter ? and(eq((this.table as any).id, id), tenantFilter) : eq((this.table as any).id, id);

        const result = await db
            .delete(this.table)
            .where(where as SQL)
            .returning();

        return result.length > 0;
    }

    /**
     * Count records (tenant-scoped)
     */
    async count(where?: SQL): Promise<number> {
        let query = db.select().from(this.table);

        const whereClause = this.withTenantFilter(where);
        if (whereClause) {
            query = query.where(whereClause) as any;
        }

        const results = await query;
        return results.length;
    }

    /**
     * Check if record exists (tenant-scoped)
     */
    async exists(where: SQL): Promise<boolean> {
        const count = await this.count(where);
        return count > 0;
    }
}
