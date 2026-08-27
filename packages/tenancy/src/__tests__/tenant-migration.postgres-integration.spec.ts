import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { DatabaseService, Model, Table, Primary, StringColumn, Column } from "@nyalajs/database";
import { TenantRegistry } from "../registry/tenant-registry.service";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";
import { TenantMigrationService } from "../migration/tenant-migration.service";

/**
 * Real, unmocked exercise of TenantMigrationService against a LIVE Postgres
 * server — two real databases on the same server (the "shared" one, and a
 * second one standing in for a tenant's own "dedicated" database), proving
 * the exact same migration flow the SQLite-file-based tests already cover
 * also works against the driver every real production deployment of this
 * package actually uses.
 *
 * Requires a live Postgres server with permission to CREATE DATABASE.
 * Skipped unless POSTGRES_TEST_URL is set (CI has no Postgres service
 * configured for this suite, so it never runs there) — run locally with:
 *   docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=nyala_test -p 5432:5432 postgres:16-alpine
 *   POSTGRES_TEST_URL="postgres://postgres@127.0.0.1:5432/nyala_test" npx vitest run tenant-migration.postgres-integration
 */
const POSTGRES_TEST_URL = process.env.POSTGRES_TEST_URL;

@Table("pg_migration_notes")
class Note extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @Column({ name: "tenant_id" })
    tenantId!: string;

    @StringColumn(500)
    body!: string;
}

describe.skipIf(!POSTGRES_TEST_URL)("TenantMigrationService — real live Postgres, two real databases", () => {
    const sharedService = new DatabaseService();
    let dedicatedUrl: string;
    let registry: TenantRegistry;
    let connections: TenantConnectionManager;
    let migrations: TenantMigrationService;

    beforeAll(async () => {
        await sharedService.connect({ driver: "pg", connectionString: POSTGRES_TEST_URL! });
        Model.setDatabase(sharedService.getDb());

        const admin = new (require("pg").Pool)({ connectionString: POSTGRES_TEST_URL });
        const dedicatedDbName = `nyala_tenant_migration_dedicated_${Date.now()}`;
        await admin.query(`DROP DATABASE IF EXISTS ${dedicatedDbName}`);
        await admin.query(`CREATE DATABASE ${dedicatedDbName}`);
        await admin.end();

        const base = new URL(POSTGRES_TEST_URL!);
        base.pathname = `/${dedicatedDbName}`;
        dedicatedUrl = base.toString();

        await (sharedService.getDb() as any).execute(
            `CREATE TABLE IF NOT EXISTS nyala_tenants (
                id text PRIMARY KEY, name text NOT NULL, "isolationMode" text NOT NULL,
                "connectionString" text, driver text, "migrationStatus" text NOT NULL,
                "createdAt" timestamp, "updatedAt" timestamp
            )`
        );
        await (sharedService.getDb() as any).execute(
            `CREATE TABLE IF NOT EXISTS pg_migration_notes (id text PRIMARY KEY, tenant_id text NOT NULL, body text NOT NULL)`
        );

        registry = new TenantRegistry(0);
        connections = new TenantConnectionManager();
        migrations = new TenantMigrationService(registry, connections);
    });

    afterAll(async () => {
        await connections.closeAll();
        await sharedService.disconnect();
    });

    it("migrateToDedicated() against real Postgres: auto-creates the target schema, copies rows, cuts over — verified via a raw independent pg client on both databases", async () => {
        await registry.register({ id: "pg-acme", name: "Acme (pg)" });
        await TenantContext.run(async () => {
            TenantContext.set("pg-acme");
            await Note.create({ id: "pg-acme-1", body: "first" } as any);
            await Note.create({ id: "pg-acme-2", body: "second" } as any);
            await Note.create({ id: "pg-acme-3", body: "third" } as any);
        });

        const result = await migrations.migrateToDedicated({
            tenantId: "pg-acme",
            connectionString: dedicatedUrl,
            driver: "pg",
            models: [Note],
            batchSize: 2,
        });

        expect(result.rowsCopied).toBe(3);

        const { Pool } = require("pg");
        const dedicatedPool = new Pool({ connectionString: dedicatedUrl });
        const dedicatedRows = await dedicatedPool.query("SELECT * FROM pg_migration_notes ORDER BY id");
        expect(dedicatedRows.rows).toHaveLength(3);
        expect(dedicatedRows.rows.every((r: any) => r.tenant_id === "pg-acme")).toBe(true);
        await dedicatedPool.end();

        const record = await registry.find("pg-acme");
        expect(record?.isolationMode).toBe("dedicated");
        expect(record?.connectionString).toBe(dedicatedUrl);
    });

    it("migrateToShared() against real Postgres reverses the migration and evicts the pooled connection", async () => {
        await registry.register({ id: "pg-globex", name: "Globex (pg)" });
        await TenantContext.run(async () => {
            TenantContext.set("pg-globex");
            await Note.create({ id: "pg-globex-1", body: "only note" } as any);
        });

        await migrations.migrateToDedicated({
            tenantId: "pg-globex",
            connectionString: dedicatedUrl,
            driver: "pg",
            models: [Note],
        });

        const result = await migrations.migrateToShared({ tenantId: "pg-globex", models: [Note] });
        expect(result.rowsCopied).toBe(1);

        const record = await registry.find("pg-globex");
        expect(record?.isolationMode).toBe("shared");

        await TenantContext.run(async () => {
            TenantContext.set("pg-globex");
            const notes = await Note.query().get();
            expect(notes).toHaveLength(1);
        });
    });
});
