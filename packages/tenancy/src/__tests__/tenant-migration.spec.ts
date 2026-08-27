import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { DatabaseService, Model, Table, Primary, StringColumn, Column, ConnectionContext } from "@nyalajs/database";
import { TenantRecord } from "../registry/tenant-record.model";
import { TenantRegistry } from "../registry/tenant-registry.service";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";
import { TenantMigrationService } from "../migration/tenant-migration.service";

/**
 * Real, unmocked end-to-end proof of shared<->dedicated migration: three
 * genuinely separate better-sqlite3 database FILES on disk —
 *   - "shared.sqlite"   the app's normal shared/system database, holding
 *                       both the tenant registry (nyala_tenants) AND the
 *                       tenant-scoped `notes` table for every shared tenant
 *   - "dedicated.sqlite" a fresh, empty database that becomes one tenant's
 *                       own dedicated database after migrateToDedicated()
 *   - a THIRD tenant's shared rows, to prove migrating one tenant never
 *     touches another tenant's rows still living in the shared table
 *
 * Nothing here is mocked — every assertion reads the real file via a raw,
 * independent connection, never trusting the service's own return value
 * alone.
 */
@Table("notes")
class Note extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @Column({ name: "tenant_id" })
    tenantId!: string;

    @StringColumn(500)
    body!: string;
}

describe("TenantMigrationService — real shared<->dedicated migration over real SQLite files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-tenant-migration-"));
    const sharedDbPath = path.join(tmpDir, "shared.sqlite");
    const dedicatedDbPath = path.join(tmpDir, "dedicated.sqlite");

    const sharedService = new DatabaseService();
    let registry: TenantRegistry;
    let connections: TenantConnectionManager;
    let migrations: TenantMigrationService;

    beforeAll(async () => {
        await sharedService.connect({ driver: "better-sqlite3", connectionString: sharedDbPath });
        Model.setDatabase(sharedService.getDb());

        // Column names here match TenantRecord's own @StringColumn()/etc.
        // property-key-as-column-name default (no explicit `name:`
        // override in the model) — i.e. camelCase, NOT snake_case.
        (sharedService.getDb() as any).run(
            "CREATE TABLE IF NOT EXISTS nyala_tenants (" +
            "id TEXT PRIMARY KEY, name TEXT NOT NULL, isolationMode TEXT NOT NULL, " +
            "connectionString TEXT, driver TEXT, migrationStatus TEXT NOT NULL, " +
            "createdAt INTEGER, updatedAt INTEGER)"
        );
        (sharedService.getDb() as any).run(
            "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, body TEXT NOT NULL)"
        );

        registry = new TenantRegistry(0); // 0ms TTL — tests must see writes immediately, not race a cache window
        connections = new TenantConnectionManager();
        migrations = new TenantMigrationService(registry, connections);
    });

    afterAll(async () => {
        await connections.closeAll();
        await sharedService.disconnect();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        if (fs.existsSync(dedicatedDbPath)) fs.rmSync(dedicatedDbPath);
    });

    async function seedSharedTenant(tenantId: string, name: string, noteBodies: string[]): Promise<void> {
        await registry.register({ id: tenantId, name, isolationMode: "shared" });
        await TenantContext.run(async () => {
            TenantContext.set(tenantId);
            for (const body of noteBodies) {
                await Note.create({ id: `${tenantId}-${body}`, body } as any);
            }
        });
    }

    it("migrateToDedicated(): auto-creates the target schema, copies exactly this tenant's rows, and cuts over — verified via raw reads on both real files", async () => {
        await seedSharedTenant("acme", "Acme Corp", ["first note", "second note", "third note"]);
        // A second tenant, left in shared, to prove isolation.
        await seedSharedTenant("globex", "Globex Inc", ["globex note"]);

        const result = await migrations.migrateToDedicated({
            tenantId: "acme",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
            models: [Note],
            batchSize: 2, // smaller than acme's 3 rows — forces multiple batches, proving pagination works
        });

        expect(result.tenantId).toBe("acme");
        expect(result.tablesCopied).toEqual(["notes"]);
        expect(result.rowsCopied).toBe(3);

        // Raw, independent read of the NEW dedicated file — must have all 3 acme rows, tenant_id included (same schema).
        const dedicatedDb = new (require("better-sqlite3"))(dedicatedDbPath);
        const dedicatedRows = dedicatedDb.prepare("SELECT * FROM notes ORDER BY id").all();
        expect(dedicatedRows).toHaveLength(3);
        expect(dedicatedRows.every((r: any) => r.tenant_id === "acme")).toBe(true);
        dedicatedDb.close();

        // Raw, independent read of the OLD shared file — acme's rows are
        // deliberately left intact (this service never deletes source
        // data), and globex's rows must be completely untouched.
        const sharedRowsAcme = (sharedService.getDb() as any).all("SELECT * FROM notes WHERE tenant_id = 'acme'");
        expect(sharedRowsAcme).toHaveLength(3);
        const sharedRowsGlobex = (sharedService.getDb() as any).all("SELECT * FROM notes WHERE tenant_id = 'globex'");
        expect(sharedRowsGlobex).toHaveLength(1);

        // The registry cutover actually happened.
        const record = await registry.find("acme");
        expect(record?.isolationMode).toBe("dedicated");
        expect(record?.connectionString).toBe(dedicatedDbPath);
        expect(record?.migrationStatus).toBe("none");
    });

    it("post-cutover, live traffic actually reads from the NEW dedicated database, not the old shared rows — proven through ConnectionContext, the same mechanism TenantMiddleware uses", async () => {
        await seedSharedTenant("initech", "Initech", ["only note"]);

        await migrations.migrateToDedicated({
            tenantId: "initech",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
            models: [Note],
        });

        // Simulate what TenantMiddleware does on the NEXT request after
        // cutover: look up the tenant, see it's dedicated, get its
        // connection, route Model calls through ConnectionContext.
        const record = await registry.findOrThrow("initech");
        expect(record.isolationMode).toBe("dedicated");
        const db = await connections.getConnection(record);

        await ConnectionContext.run(db, async () => {
            await TenantContext.run(async () => {
                TenantContext.set("initech");
                const notes = await Note.query().get();
                expect(notes).toHaveLength(1);
                expect(notes[0].body).toBe("only note");

                // Writing post-cutover must land in the DEDICATED file, not the old shared one.
                await Note.create({ id: "initech-new-note", body: "written after cutover" } as any);
            });
        });

        const dedicatedDb = new (require("better-sqlite3"))(dedicatedDbPath);
        const newRow = dedicatedDb.prepare("SELECT * FROM notes WHERE id = 'initech-new-note'").get();
        expect(newRow).toBeDefined();
        dedicatedDb.close();

        const sharedNewRow = (sharedService.getDb() as any).all("SELECT * FROM notes WHERE id = 'initech-new-note'");
        expect(sharedNewRow).toHaveLength(0);
    });

    it("migrateToShared(): reverses a dedicated tenant back into the shared table, stamping tenant_id, and evicts its pooled connection", async () => {
        await seedSharedTenant("umbrella", "Umbrella Corp", ["note a", "note b"]);
        await migrations.migrateToDedicated({
            tenantId: "umbrella",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
            models: [Note],
        });

        // Confirm it's really dedicated first, and warm the connection pool
        // (so we can prove eviction actually happens after migrating back).
        const dedicatedRecord = await registry.findOrThrow("umbrella");
        await connections.getConnection(dedicatedRecord);
        expect(connections.size()).toBeGreaterThan(0);

        const result = await migrations.migrateToShared({
            tenantId: "umbrella",
            models: [Note],
        });

        expect(result.tenantId).toBe("umbrella");
        expect(result.rowsCopied).toBe(2);

        const record = await registry.find("umbrella");
        expect(record?.isolationMode).toBe("shared");
        expect(record?.connectionString).toBeNull();

        // Rows are back in the shared table, tenant_id intact.
        const sharedRows = (sharedService.getDb() as any).all("SELECT * FROM notes WHERE tenant_id = 'umbrella'");
        expect(sharedRows).toHaveLength(2);

        // A request for this tenant now, with NO ConnectionContext override
        // (exactly what TenantMiddleware would do for a "shared" tenant),
        // must resolve via the normal shared path and see its data.
        await TenantContext.run(async () => {
            TenantContext.set("umbrella");
            const notes = await Note.query().get();
            expect(notes).toHaveLength(2);
        });
    });

    it("re-migrating to dedicated a SECOND time upserts rather than duplicating or throwing — proves the leftover stale source row is overwritten, not collided with", async () => {
        await seedSharedTenant("wonka", "Wonka Industries", ["original note"]);

        await migrations.migrateToDedicated({
            tenantId: "wonka",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
            models: [Note],
        });

        // Change the row's content directly on the (still-active) shared
        // source and migrate back to shared — with the SAME id already
        // sitting in the shared table from the original seed. This must
        // upsert (overwrite), not throw a unique-constraint error.
        await TenantContext.run(async () => {
            TenantContext.set("wonka");
            const note = await Note.find("wonka-original note");
            (note as any).body = "updated on dedicated side";
            await note!.save();
        });

        // Directly mutate the dedicated file's copy too, so source and the
        // stale shared-table leftover now clearly disagree — proves which
        // one wins.
        const dedicatedDbRaw = new (require("better-sqlite3"))(dedicatedDbPath);
        dedicatedDbRaw.prepare("UPDATE notes SET body = ? WHERE id = ?").run("dedicated-authoritative-value", "wonka-original note");
        dedicatedDbRaw.close();

        await migrations.migrateToShared({ tenantId: "wonka", models: [Note] });

        // Exactly one row for this id — not duplicated.
        const rows = (sharedService.getDb() as any).all("SELECT * FROM notes WHERE id = 'wonka-original note'");
        expect(rows).toHaveLength(1);
        // The dedicated (source-of-truth-post-cutover) value won, not the stale shared leftover.
        expect(rows[0].body).toBe("dedicated-authoritative-value");
    });

    it("verification catches a REAL row-count mismatch and fails the migration instead of cutting over to an incomplete/incorrect target", async () => {
        await seedSharedTenant("soylent", "Soylent Corp", ["note one", "note two"]);

        // Pre-create the target file with its schema, then plant an extra
        // row for this SAME tenant id that the real copy step will never
        // produce — a genuine, real discrepancy between source (2 rows)
        // and what the target will end up with (2 copied + 1 planted = 3).
        const Database = require("better-sqlite3");
        const preDb = new Database(dedicatedDbPath);
        preDb.exec('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, body TEXT NOT NULL)');
        preDb.prepare("INSERT INTO notes (id, tenant_id, body) VALUES (?, ?, ?)").run("soylent-planted-stray-row", "soylent", "should never be here");
        preDb.close();

        await expect(
            migrations.migrateToDedicated({
                tenantId: "soylent",
                connectionString: dedicatedDbPath,
                driver: "better-sqlite3",
                models: [Note],
                autoCreateSchema: false, // schema already exists (created above) — prove verification runs even on that path
            })
        ).rejects.toThrow(/Migration verification failed.*source has 2 rows, target has 3/);

        // Critically: the cutover must NOT have happened — the tenant is
        // still shared, so live traffic keeps working against real data
        // instead of routing to the unverified/incomplete target.
        const record = await registry.find("soylent");
        expect(record?.isolationMode).toBe("shared");
        expect(record?.migrationStatus).toBe("failed");
    });

    it("migrateToDedicated() throws (and marks migrationStatus 'failed') for a tenant that's already dedicated", async () => {
        await seedSharedTenant("hooli", "Hooli", ["one note"]);
        await migrations.migrateToDedicated({
            tenantId: "hooli",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
            models: [Note],
        });

        await expect(
            migrations.migrateToDedicated({
                tenantId: "hooli",
                connectionString: dedicatedDbPath,
                driver: "better-sqlite3",
                models: [Note],
            })
        ).rejects.toThrow(/already dedicated/);

        // This early guard fires before any migrationStatus write — the
        // tenant should still read as fully settled, not stuck "failed".
        const record = await registry.find("hooli");
        expect(record?.migrationStatus).toBe("none");
    });

    it("migrateToShared() throws for a tenant that's already shared", async () => {
        await seedSharedTenant("pied-piper", "Pied Piper", ["one note"]);

        await expect(migrations.migrateToShared({ tenantId: "pied-piper", models: [Note] })).rejects.toThrow(/not dedicated/);
    });

    it("onProgress fires with real cumulative counts across multiple batches", async () => {
        await seedSharedTenant("stark", "Stark Industries", ["n1", "n2", "n3", "n4", "n5"]);

        const progressCalls: Array<{ table: string; count: number }> = [];
        await migrations.migrateToDedicated({
            tenantId: "stark",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
            models: [Note],
            batchSize: 2,
            onProgress: (table, count) => progressCalls.push({ table, count }),
        });

        // 5 rows, batch size 2 -> batches of 2, 2, 1 -> cumulative 2, 4, 5.
        expect(progressCalls).toEqual([
            { table: "notes", count: 2 },
            { table: "notes", count: 4 },
            { table: "notes", count: 5 },
        ]);
    });

    it("findOrThrow() gives a clear error for a tenant id that was never registered", async () => {
        await expect(
            migrations.migrateToDedicated({
                tenantId: "does-not-exist",
                connectionString: dedicatedDbPath,
                driver: "better-sqlite3",
                models: [Note],
            })
        ).rejects.toThrow(/Unknown tenant/);
    });
});
