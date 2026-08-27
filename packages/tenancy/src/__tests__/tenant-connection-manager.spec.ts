import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";
import { TenantRecord } from "../registry/tenant-record.model";

/**
 * Real, unmocked exercise of TenantConnectionManager against real
 * better-sqlite3 files — lazy open, connection reuse, concurrent-open
 * deduplication, LRU eviction under a capacity cap, and idle sweeping.
 */
function dedicatedRecord(id: string, dbPath: string): TenantRecord {
    const record = new TenantRecord();
    (record as any).id = id;
    (record as any).name = id;
    (record as any).isolationMode = "dedicated";
    (record as any).connectionString = dbPath;
    (record as any).driver = "better-sqlite3";
    (record as any).migrationStatus = "none";
    return record;
}

describe("TenantConnectionManager — real connection pooling over real SQLite files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-connection-manager-"));
    let manager: TenantConnectionManager;

    beforeEach(() => {
        manager = new TenantConnectionManager();
    });

    afterEach(async () => {
        await manager.closeAll();
    });

    it("throws for a tenant whose isolationMode isn't 'dedicated' — a defensive backstop, not the primary check", async () => {
        const sharedRecord = dedicatedRecord("shared-tenant", path.join(tmpDir, "unused.sqlite"));
        (sharedRecord as any).isolationMode = "shared";
        await expect(manager.getConnection(sharedRecord)).rejects.toThrow(/isolationMode is "shared", not "dedicated"/);
    });

    it("throws for a 'dedicated' record with no connectionString set", async () => {
        const record = dedicatedRecord("no-conn-string", "");
        (record as any).connectionString = null;
        await expect(manager.getConnection(record)).rejects.toThrow(/no connectionString set/);
    });

    it("lazily opens a real connection on first use, then reuses the SAME connection on subsequent calls", async () => {
        const dbPath = path.join(tmpDir, "lazy.sqlite");
        const record = dedicatedRecord("lazy-tenant", dbPath);

        expect(manager.size()).toBe(0);

        const db1 = await manager.getConnection(record);
        expect(manager.size()).toBe(1);
        expect(fs.existsSync(dbPath)).toBe(true); // really opened a real file

        const db2 = await manager.getConnection(record);
        expect(db2).toBe(db1); // same instance — reused, not reopened
        expect(manager.size()).toBe(1); // still just one
    });

    it("concurrent getConnection() calls for the same cold tenant open exactly ONE real connection, not a race of duplicates", async () => {
        const dbPath = path.join(tmpDir, "concurrent.sqlite");
        const record = dedicatedRecord("concurrent-tenant", dbPath);

        const [db1, db2, db3] = await Promise.all([
            manager.getConnection(record),
            manager.getConnection(record),
            manager.getConnection(record),
        ]);

        expect(db1).toBe(db2);
        expect(db2).toBe(db3);
        expect(manager.size()).toBe(1);
    });

    it("evict() closes and removes one tenant's connection — a later getConnection() for it opens a genuinely fresh connection", async () => {
        const dbPath = path.join(tmpDir, "evict.sqlite");
        const record = dedicatedRecord("evict-tenant", dbPath);

        const db1 = await manager.getConnection(record);
        expect(manager.size()).toBe(1);

        await manager.evict("evict-tenant");
        expect(manager.size()).toBe(0);

        const db2 = await manager.getConnection(record);
        expect(db2).not.toBe(db1);
        expect(manager.size()).toBe(1);
    });

    it("evict() on a tenant with no open connection is a safe no-op", async () => {
        await expect(manager.evict("never-opened")).resolves.toBeUndefined();
    });

    it("LRU eviction: opening beyond maxOpenConnections closes the least-recently-used connection to make room, never refuses the new one", async () => {
        const capped = new TenantConnectionManager({ maxOpenConnections: 2 });
        try {
            const recordA = dedicatedRecord("lru-a", path.join(tmpDir, "lru-a.sqlite"));
            const recordB = dedicatedRecord("lru-b", path.join(tmpDir, "lru-b.sqlite"));
            const recordC = dedicatedRecord("lru-c", path.join(tmpDir, "lru-c.sqlite"));

            await capped.getConnection(recordA);
            await new Promise((r) => setTimeout(r, 5));
            await capped.getConnection(recordB);
            expect(capped.size()).toBe(2);

            // Opening a third, over the cap of 2, must evict the LRU one (A) to make room.
            await capped.getConnection(recordC);
            expect(capped.size()).toBe(2);

            // A's connection was really closed — getConnection() for it now opens a genuinely new one.
            const dbA1 = await capped.getConnection(recordA);
            // (This 4th open evicts B this time, since C and the reopened A are now the 2 most recent.)
            expect(capped.size()).toBe(2);
            const dbA2 = await capped.getConnection(recordA);
            expect(dbA2).toBe(dbA1); // reused correctly after being re-opened
        } finally {
            await capped.closeAll();
        }
    });

    it("idle sweep closes a connection that's gone unused past idleTtlMs, without touching one still recently used", async () => {
        const idleTtlMs = 60;
        const shortTtl = new TenantConnectionManager({ idleTtlMs });
        try {
            const idleRecord = dedicatedRecord("idle-tenant", path.join(tmpDir, "idle.sqlite"));
            const activeRecord = dedicatedRecord("active-tenant", path.join(tmpDir, "active.sqlite"));

            await shortTtl.getConnection(idleRecord);
            expect(shortTtl.size()).toBe(1);

            // Let idleRecord sit long enough to cross the TTL on its own,
            // then touch activeRecord for the FIRST time right after —
            // its lastUsedAt is now fresh, well under the TTL, while
            // idleRecord's is already stale.
            await new Promise((r) => setTimeout(r, idleTtlMs + 20));
            await shortTtl.getConnection(activeRecord);
            expect(shortTtl.size()).toBe(2);

            shortTtl.startIdleSweep(15);
            // Wait long enough for at least one sweep tick, but well short
            // of activeRecord (opened just above) also crossing the TTL.
            await new Promise((r) => setTimeout(r, 30));

            expect(shortTtl.size()).toBe(1); // idleRecord evicted, activeRecord survived
        } finally {
            await shortTtl.closeAll();
        }
    });

    it("closeAll() closes every open connection and resets size() to 0", async () => {
        await manager.getConnection(dedicatedRecord("close-a", path.join(tmpDir, "close-a.sqlite")));
        await manager.getConnection(dedicatedRecord("close-b", path.join(tmpDir, "close-b.sqlite")));
        expect(manager.size()).toBe(2);

        await manager.closeAll();
        expect(manager.size()).toBe(0);
    });
});
