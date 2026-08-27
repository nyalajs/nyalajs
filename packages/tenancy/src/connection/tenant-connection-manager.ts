import { Injectable } from "@nyalajs/core";
import { AnyDatabase, DatabaseDriver, openConnection } from "@nyalajs/database";
import { TenantRecord } from "../registry/tenant-record.model";

export interface TenantConnectionManagerOptions {
    /**
     * Close and evict a dedicated tenant's connection after this many ms of
     * no use, so a process that has touched hundreds of dedicated tenants
     * over its lifetime doesn't hold hundreds of idle connection pools open
     * forever. Default: 10 minutes.
     */
    idleTtlMs?: number;
    /**
     * Hard ceiling on how many dedicated-tenant connections may be open at
     * once. When it would be exceeded, the least-recently-used connection is
     * closed to make room (evicted, not refused) — so this bounds resource
     * usage in one process without capping how many dedicated tenants the
     * DEPLOYMENT can have. Default: 100.
     */
    maxOpenConnections?: number;
    /** Per-tenant connection pool size passed through to the driver. Default: 5 (smaller than the shared pool's default 10, since this is per-tenant, not shared across everyone). */
    maxConnectionsPerTenant?: number;
}

interface PooledEntry {
    db: AnyDatabase;
    close: () => Promise<void>;
    lastUsedAt: number;
}

/**
 * Owns the live pool of dedicated-tenant database connections: lazily opens
 * one real connection the first time a "dedicated" tenant is touched,
 * reuses it for every subsequent request from that same tenant, and evicts
 * (closes) idle ones so a long-running process with many dedicated tenants
 * doesn't leak connections or exhaust the database server's own connection
 * limit.
 *
 * This is deliberately a SEPARATE pool from `DatabaseService` (the app's
 * single shared/default connection) — a dedicated tenant's connection is
 * opened via the same underlying `openConnection()` @nyalajs/database
 * already uses for the main connection, just keyed by tenant id instead of
 * being a process-global singleton.
 *
 * `getConnection()` is safe to call concurrently for the same tenant (e.g.
 * two requests for a cold tenant arriving at once) — only one real
 * connection is opened; the second caller awaits the first's in-flight open
 * instead of racing a duplicate one.
 */
@Injectable()
export class TenantConnectionManager {
    private readonly pool = new Map<string, PooledEntry>();
    private readonly inFlight = new Map<string, Promise<PooledEntry>>();
    private readonly idleTtlMs: number;
    private readonly maxOpenConnections: number;
    private readonly maxConnectionsPerTenant: number;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(options: TenantConnectionManagerOptions = {}) {
        this.idleTtlMs = options.idleTtlMs ?? 10 * 60 * 1000;
        this.maxOpenConnections = options.maxOpenConnections ?? 100;
        this.maxConnectionsPerTenant = options.maxConnectionsPerTenant ?? 5;
    }

    /**
     * Returns the (possibly newly-opened) connection for a dedicated tenant.
     * Throws if `record.isolationMode` isn't "dedicated" — callers (i.e.
     * TenantMiddleware) are expected to check that first, this is a
     * defensive backstop against a bug in that check, not the primary
     * validation path.
     */
    async getConnection(record: TenantRecord): Promise<AnyDatabase> {
        if (record.isolationMode !== "dedicated") {
            throw new Error(
                `[nyala/tenancy] getConnection() called for tenant "${record.id}", whose isolationMode is ` +
                `"${record.isolationMode}", not "dedicated". This is an internal bug, not a config problem.`
            );
        }
        if (!record.connectionString) {
            throw new Error(
                `[nyala/tenancy] Tenant "${record.id}" is marked "dedicated" but has no connectionString set.`
            );
        }

        const existing = this.pool.get(record.id);
        if (existing) {
            existing.lastUsedAt = Date.now();
            return existing.db;
        }

        const alreadyOpening = this.inFlight.get(record.id);
        if (alreadyOpening) {
            return (await alreadyOpening).db;
        }

        const openPromise = this.openAndRegister(record);
        this.inFlight.set(record.id, openPromise);
        try {
            const entry = await openPromise;
            return entry.db;
        } finally {
            this.inFlight.delete(record.id);
        }
    }

    private async openAndRegister(record: TenantRecord): Promise<PooledEntry> {
        await this.evictIfOverCapacity();

        const opened = await openConnection({
            driver: (record.driver as DatabaseDriver | undefined) ?? "pg",
            connectionString: record.connectionString!,
            maxConnections: this.maxConnectionsPerTenant,
        });

        const entry: PooledEntry = { db: opened.db, close: opened.close, lastUsedAt: Date.now() };
        this.pool.set(record.id, entry);
        return entry;
    }

    /** Closes and evicts the least-recently-used connection if we're at the cap. */
    private async evictIfOverCapacity(): Promise<void> {
        if (this.pool.size < this.maxOpenConnections) return;

        let lruId: string | null = null;
        let lruAt = Infinity;
        for (const [id, entry] of this.pool) {
            if (entry.lastUsedAt < lruAt) {
                lruAt = entry.lastUsedAt;
                lruId = id;
            }
        }
        if (lruId) {
            await this.evict(lruId);
        }
    }

    /** Closes and removes one tenant's connection immediately — used after a migration cutover (the pool must forget the pre-migration connection) or for manual eviction. */
    async evict(tenantId: string): Promise<void> {
        const entry = this.pool.get(tenantId);
        if (!entry) return;
        this.pool.delete(tenantId);
        await entry.close();
    }

    /** How many dedicated-tenant connections are currently open. Exposed for tests/observability, not meant to drive app logic. */
    size(): number {
        return this.pool.size;
    }

    /** Starts the periodic idle-connection sweep. Call once at app bootstrap; safe to call multiple times (later calls are no-ops while a sweep is already running). */
    startIdleSweep(intervalMs: number = 60_000): void {
        if (this.sweepTimer) return;
        this.sweepTimer = setInterval(() => {
            void this.sweepIdle();
        }, intervalMs);
        this.sweepTimer.unref?.();
    }

    stopIdleSweep(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
    }

    private async sweepIdle(): Promise<void> {
        const now = Date.now();
        const idleIds: string[] = [];
        for (const [id, entry] of this.pool) {
            if (now - entry.lastUsedAt > this.idleTtlMs) {
                idleIds.push(id);
            }
        }
        for (const id of idleIds) {
            await this.evict(id);
        }
    }

    /** Closes every open dedicated-tenant connection. Call during app shutdown. */
    async closeAll(): Promise<void> {
        this.stopIdleSweep();
        const closers = Array.from(this.pool.values()).map((entry) => entry.close());
        this.pool.clear();
        await Promise.all(closers);
    }
}
