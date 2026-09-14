import { sql } from "drizzle-orm";

/**
 * Adds `nyala_tenants` — @nyalajs/tenancy's TenantRegistry table, the
 * source of truth for whether a given tenant is on the shared database
 * (row-level tenant_id isolation, the default for every tenant) or has been
 * migrated to its own dedicated database. Lives in the SAME database as
 * everything else (the shared/system database) even for tenants that are
 * themselves dedicated — see TenantRecord's own doc comment for why this
 * table specifically can never be tenant-scoped or migrated itself.
 *
 * Column names are camelCase (quoted), matching @nyalajs/permissions'
 * roles/permissions tables in 0002_tenant_lifecycle_and_rbac.ts — same
 * reason: @nyalajs/database's Model/SchemaRegistry maps a decorated
 * property directly to a same-named column, with no camelCase->snake_case
 * translation, and TenantRecord (like Role/Permission) is a Model class
 * this template doesn't own the source of.
 */

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS nyala_tenants (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            "isolationMode" VARCHAR(20) NOT NULL DEFAULT 'shared',
            "connectionString" VARCHAR(2048),
            driver VARCHAR(20),
            "migrationStatus" VARCHAR(30) NOT NULL DEFAULT 'none',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);

    console.log("✔ Migration completed: nyala_tenants table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS nyala_tenants CASCADE;`);
    console.log("✔ Migration rolled back");
}
