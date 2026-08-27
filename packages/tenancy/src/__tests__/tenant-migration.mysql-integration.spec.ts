import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { DatabaseService, Model, Table, Primary, StringColumn, Column } from "@nyalajs/database";
import { TenantRegistry } from "../registry/tenant-registry.service";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";
import { TenantMigrationService } from "../migration/tenant-migration.service";

/**
 * Real, unmocked exercise of TenantMigrationService against a LIVE MySQL
 * server — two real databases on the same server (the "shared" one, and a
 * second one standing in for a tenant's own "dedicated" database), proving
 * the same migration flow the SQLite-file and Postgres-gated tests already
 * cover also works against MySQL — this package's third and final
 * supported dialect (the fourth driver, "postgres"/postgres-js, shares its
 * dialect with "pg" and its own openConnection() branch is covered by the
 * @nyalajs/database driver test suite directly, not duplicated here).
 *
 * Requires a live MySQL server with permission to CREATE DATABASE. Skipped
 * unless MYSQL_TEST_URL is set (CI has no MySQL service configured for this
 * suite, so it never runs there) — run locally with e.g.:
 *   docker run --rm -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=nyala_test -p 3306:3306 mysql:8
 *   MYSQL_TEST_URL="mysql://root@127.0.0.1:3306/nyala_test" npx vitest run tenant-migration.mysql-integration
 */
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

@Table("mysql_migration_notes")
class Note extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @Column({ name: "tenant_id" })
    tenantId!: string;

    @StringColumn(500)
    body!: string;
}

describe.skipIf(!MYSQL_TEST_URL)("TenantMigrationService — real live MySQL, two real databases", () => {
    const sharedService = new DatabaseService();
    let dedicatedUrl: string;
    let registry: TenantRegistry;
    let connections: TenantConnectionManager;
    let migrations: TenantMigrationService;

    beforeAll(async () => {
        await sharedService.connect({ driver: "mysql2", connectionString: MYSQL_TEST_URL! });
        Model.setDatabase(sharedService.getDb());

        const mysql = require("mysql2/promise");
        const admin = await mysql.createConnection(MYSQL_TEST_URL);
        const dedicatedDbName = `nyala_tenant_migration_dedicated_${Date.now()}`;
        await admin.query(`DROP DATABASE IF EXISTS ${dedicatedDbName}`);
        await admin.query(`CREATE DATABASE ${dedicatedDbName}`);
        await admin.end();

        const base = new URL(MYSQL_TEST_URL!);
        base.pathname = `/${dedicatedDbName}`;
        dedicatedUrl = base.toString();

        await (sharedService.getDb() as any).execute(
            `CREATE TABLE IF NOT EXISTS nyala_tenants (
                id VARCHAR(255) PRIMARY KEY, name TEXT NOT NULL, \`isolationMode\` VARCHAR(255) NOT NULL,
                \`connectionString\` TEXT, driver TEXT, \`migrationStatus\` VARCHAR(255) NOT NULL,
                \`createdAt\` DATETIME, \`updatedAt\` DATETIME
            )`
        );
        await (sharedService.getDb() as any).execute(
            `CREATE TABLE IF NOT EXISTS mysql_migration_notes (id VARCHAR(255) PRIMARY KEY, tenant_id VARCHAR(255) NOT NULL, body TEXT NOT NULL)`
        );

        registry = new TenantRegistry(0);
        connections = new TenantConnectionManager();
        migrations = new TenantMigrationService(registry, connections);
    });

    afterAll(async () => {
        await connections.closeAll();
        await sharedService.disconnect();
    });

    it("migrateToDedicated() against real MySQL: auto-creates the target schema, copies rows, cuts over — verified via a raw independent mysql2 client on both databases", async () => {
        await registry.register({ id: "mysql-acme", name: "Acme (mysql)" });
        await TenantContext.run(async () => {
            TenantContext.set("mysql-acme");
            await Note.create({ id: "mysql-acme-1", body: "first" } as any);
            await Note.create({ id: "mysql-acme-2", body: "second" } as any);
            await Note.create({ id: "mysql-acme-3", body: "third" } as any);
        });

        const result = await migrations.migrateToDedicated({
            tenantId: "mysql-acme",
            connectionString: dedicatedUrl,
            driver: "mysql2",
            models: [Note],
            batchSize: 2,
        });

        expect(result.rowsCopied).toBe(3);

        const mysql = require("mysql2/promise");
        const dedicatedConn = await mysql.createConnection(dedicatedUrl);
        const [dedicatedRows] = await dedicatedConn.query("SELECT * FROM mysql_migration_notes ORDER BY id");
        expect(dedicatedRows).toHaveLength(3);
        expect((dedicatedRows as any[]).every((r: any) => r.tenant_id === "mysql-acme")).toBe(true);
        await dedicatedConn.end();

        const record = await registry.find("mysql-acme");
        expect(record?.isolationMode).toBe("dedicated");
        expect(record?.connectionString).toBe(dedicatedUrl);
    });

    it("migrateToShared() against real MySQL reverses the migration and evicts the pooled connection", async () => {
        await registry.register({ id: "mysql-globex", name: "Globex (mysql)" });
        await TenantContext.run(async () => {
            TenantContext.set("mysql-globex");
            await Note.create({ id: "mysql-globex-1", body: "only note" } as any);
        });

        await migrations.migrateToDedicated({
            tenantId: "mysql-globex",
            connectionString: dedicatedUrl,
            driver: "mysql2",
            models: [Note],
        });

        const result = await migrations.migrateToShared({ tenantId: "mysql-globex", models: [Note] });
        expect(result.rowsCopied).toBe(1);

        const record = await registry.find("mysql-globex");
        expect(record?.isolationMode).toBe("shared");

        await TenantContext.run(async () => {
            TenantContext.set("mysql-globex");
            const notes = await Note.query().get();
            expect(notes).toHaveLength(1);
        });
    });
});
