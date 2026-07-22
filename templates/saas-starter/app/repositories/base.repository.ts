import { Injectable } from "@nyalajs/core";
import { eq, and, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../database/connection";

/**
 * Tenant-Aware Base Repository
 *
 * Automatically filters queries by tenant_id for multi-tenant isolation.
 * All queries are scoped to the current tenant from the request context.
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
    private tenantId?: string;

    constructor(
        protected readonly table: PgTable,
        protected readonly isTenantAware: boolean = true
    ) { }

    /**
     * Set current tenant ID (should be called from middleware)
     */
    setTenantId(tenantId: string | undefined): void {
        this.tenantId = tenantId;
    }

    /**
     * Get current tenant ID
     */
    protected getTenantId(): string | undefined {
        return this.tenantId;
    }

    /**
     * Add tenant filter to where clause
     */
    protected withTenantFilter(where?: SQL): SQL {
        const tenantId = this.getTenantId();

        if (!tenantId || !this.isTenantAware) {
            return where || (undefined as any);
        }

        const tenantFilter = eq((this.table as any).tenantId, tenantId);

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
        const where = and(
            eq((this.table as any).id, id),
            this.getTenantId() && this.isTenantAware
                ? eq((this.table as any).tenantId, this.getTenantId()!)
                : undefined
        );

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

        const recordData = this.isTenantAware && tenantId
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
        const where = and(
            eq((this.table as any).id, id),
            this.getTenantId() && this.isTenantAware
                ? eq((this.table as any).tenantId, this.getTenantId()!)
                : undefined
        );

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
        const where = and(
            eq((this.table as any).id, id),
            this.getTenantId() && this.isTenantAware
                ? eq((this.table as any).tenantId, this.getTenantId()!)
                : undefined
        );

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
