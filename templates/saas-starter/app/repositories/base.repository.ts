import { Injectable, TenantContext } from "@nyalajs/core";
import { Model } from "@nyalajs/database";

/**
 * Tenant-Aware Base Repository
 *
 * Thin wrapper around a @nyalajs/database Model class. Tenant scoping is
 * enforced by Model itself (TenantContext-based, mandatory for any table
 * with a `tenantId` column — see Model.requireTenantScope()/stampTenant());
 * this class exists to give every repository a familiar, stable method
 * surface (`findAll`/`findById`/`create`/`update`/`delete`/...) so service
 * code never has to know whether it's really talking to Model underneath.
 *
 * Using a real Model class (not a raw Drizzle table, as this repository
 * layer used to wrap) is what makes @nyalajs/tenancy's dedicated-per-tenant
 * database support actually work end-to-end for this app: TenantMiddleware
 * routes a "dedicated" tenant's request through ConnectionContext, which
 * Model reads transparently — and TenantMigrationService (the shared<->
 * dedicated data-copy engine) only ever operates on Model classes, not raw
 * Drizzle tables, so a repository NOT wrapping a Model couldn't be migrated
 * at all.
 *
 * `isTenantAware=false` here just means "don't pass options.tenantId
 * mismatches" — it's informational for subclasses; the REAL enforcement
 * (whether a table is scoped at all) is entirely driven by whether the
 * Model's own table has a `tenantId` column, not by this flag. A
 * non-tenant-scoped Model (no tenantId property) works identically whether
 * this is true or false.
 *
 * @example
 * export class UserRepository extends BaseRepository<User> {
 *     constructor() {
 *         super(User);
 *     }
 * }
 */
@Injectable()
export abstract class BaseRepository<T extends Model> {
    constructor(protected readonly modelClass: new () => T) {}

    /** Find all records (tenant-scoped by Model automatically, when the table has a tenantId column). */
    async findAll(options?: { limit?: number; offset?: number }): Promise<T[]> {
        let query = (this.modelClass as any).query();
        if (options?.limit !== undefined) query = query.limit(options.limit);
        if (options?.offset !== undefined) query = query.offset(options.offset);
        return query.get();
    }

    /** Find record by ID (tenant-scoped). */
    async findById(id: string): Promise<T | null> {
        return (this.modelClass as any).find(id);
    }

    /** Create a new record (Model auto-stamps tenantId from TenantContext when the table is tenant-scoped). */
    async create(data: Partial<T>): Promise<T> {
        return (this.modelClass as any).create(data);
    }

    /** Update record by ID (tenant-scoped read, then save — matches Model's own fetch-then-save shape). Returns null if no matching row was found (including "found, but in a different tenant"). */
    async update(id: string, data: Partial<T>): Promise<T | null> {
        const existing = await (this.modelClass as any).find(id);
        if (!existing) return null;
        Object.assign(existing, data);
        await existing.save();
        return existing;
    }

    /** Delete record by ID (tenant-scoped). Returns false if no matching row was found. */
    async delete(id: string): Promise<boolean> {
        const existing = await (this.modelClass as any).find(id);
        if (!existing) return false;
        await existing.delete();
        return true;
    }

    /** Count records (tenant-scoped). */
    async count(): Promise<number> {
        const rows = await (this.modelClass as any).query().get();
        return rows.length;
    }

    /** Current tenant id, or undefined if none is active — for subclasses that need to reason about it directly rather than relying on Model's implicit scoping. */
    protected getTenantId(): string | undefined {
        return TenantContext.get();
    }
}
