import { Injectable } from "@nyalajs/core";
import { TenantRecord, TenantIsolationMode, TenantMigrationStatus } from "./tenant-record.model";

export interface RegisterTenantOptions {
    id: string;
    name: string;
    isolationMode?: TenantIsolationMode;
    connectionString?: string;
    driver?: string;
}

/**
 * CRUD + lookup over the tenant registry (the `nyala_tenants` table in the
 * shared/system database). This is the single source of truth
 * TenantMiddleware and TenantConnectionManager both read from to decide
 * "is this tenant shared or dedicated, and if dedicated, what's its
 * connection string" on every request.
 *
 * A short-TTL in-process cache sits in front of the DB lookup — every
 * tenant-scoped request needs this answer, so hitting the shared DB on
 * every single request would add a synchronous round trip ahead of the
 * tenant's OWN query. Any write through this service (register/setMode/
 * update) invalidates that tenant's cache entry immediately, so a
 * migration's cutover (see TenantMigrationService) is visible on the very
 * next request, not after some stale TTL — the TTL only bounds staleness
 * for changes made directly in the DB outside this service (e.g. a manual
 * SQL UPDATE), which isn't the supported path anyway.
 */
@Injectable()
export class TenantRegistry {
    private readonly cache = new Map<string, { record: TenantRecord; expiresAt: number }>();

    constructor(private readonly cacheTtlMs: number = 30_000) {}

    async register(options: RegisterTenantOptions): Promise<TenantRecord> {
        const now = new Date();
        const record = await TenantRecord.create({
            id: options.id,
            name: options.name,
            isolationMode: options.isolationMode ?? "shared",
            connectionString: options.connectionString ?? null,
            driver: options.driver ?? null,
            migrationStatus: "none",
            createdAt: now,
            updatedAt: now,
        } as Partial<TenantRecord>);

        this.cache.set(record.id, { record, expiresAt: Date.now() + this.cacheTtlMs });
        return record;
    }

    async find(tenantId: string): Promise<TenantRecord | null> {
        const cached = this.cache.get(tenantId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.record;
        }

        const record = await TenantRecord.find(tenantId);
        if (record) {
            this.cache.set(tenantId, { record, expiresAt: Date.now() + this.cacheTtlMs });
        } else {
            this.cache.delete(tenantId);
        }
        return record;
    }

    /** Throws if the tenant doesn't exist — for call sites where a missing tenant is a bug, not a valid outcome. */
    async findOrThrow(tenantId: string): Promise<TenantRecord> {
        const record = await this.find(tenantId);
        if (!record) {
            throw new Error(`[nyala/tenancy] Unknown tenant: "${tenantId}" has no entry in the tenant registry.`);
        }
        return record;
    }

    /**
     * Updates isolation state directly (bypassing Model.save()'s tenant
     * scoping, since TenantRecord is deliberately not tenant-scoped, so this
     * is really just a normal update — spelled out explicitly here so
     * TenantMigrationService's cutover has one atomic-looking call site).
     */
    async setIsolation(
        tenantId: string,
        update: { isolationMode: TenantIsolationMode; connectionString?: string | null; driver?: string | null }
    ): Promise<TenantRecord> {
        const record = await TenantRecord.find(tenantId);
        if (!record) {
            throw new Error(`[nyala/tenancy] Unknown tenant: "${tenantId}" has no entry in the tenant registry.`);
        }

        record.isolationMode = update.isolationMode;
        record.connectionString = update.connectionString ?? null;
        record.driver = update.driver ?? null;
        (record as any).updatedAt = new Date();
        await record.save();

        this.invalidate(tenantId);
        return record;
    }

    async setMigrationStatus(tenantId: string, status: TenantMigrationStatus): Promise<void> {
        const record = await TenantRecord.find(tenantId);
        if (!record) {
            throw new Error(`[nyala/tenancy] Unknown tenant: "${tenantId}" has no entry in the tenant registry.`);
        }
        record.migrationStatus = status;
        (record as any).updatedAt = new Date();
        await record.save();
        this.invalidate(tenantId);
    }

    invalidate(tenantId: string): void {
        this.cache.delete(tenantId);
    }
}
