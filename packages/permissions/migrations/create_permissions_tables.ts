import { sql } from "drizzle-orm";

/**
 * Migration template for @nyalajs/permissions — copy this into your app's
 * database/migrations/ (renumbered to fit your existing sequence, e.g.
 * 0003_create_permissions_tables.ts) and run `nyala db:migrate`.
 *
 * Column names are camelCase and match the property keys on Role/
 * Permission/ModelHasRole/ModelHasPermission/RoleHasPermission exactly
 * (packages/permissions/src/models/*.ts) — @nyalajs/database's Model/
 * SchemaRegistry does NOT translate camelCase properties to snake_case
 * columns, so this DDL must name columns the same way the decorators do.
 *
 * Written for Postgres, matching this framework's `nyala db:migrate` CLI
 * (currently Postgres-only). Adjust the column types (UUID -> TEXT, TIMESTAMP
 * -> stored as a Unix-epoch or ISO-string TEXT column, etc.) if you're
 * running MySQL or SQLite directly via DatabaseService without the CLI.
 *
 * The "teamId" columns are deliberately NOT named "tenantId": @nyalajs/
 * database's Model/QueryBuilder treats ANY column literally named
 * "tenantId" as mandatory automatic tenant scoping (it throws if a table
 * has that column and no TenantContext is active for the current request —
 * see requireTenantScope() in model.ts). That fail-closed behavior is
 * exactly right for ordinary application data, but wrong here: a GLOBAL
 * role (no team) and a team-scoped role need to coexist in the same table,
 * queryable without a tenant forced onto every read. "teamId" (Spatie's own
 * name for this exact feature) sidesteps the automatic-scoping trigger
 * entirely — RoleService/PermissionService apply team filtering explicitly
 * in their own WHERE clauses instead.
 */

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS roles (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            "guardName" VARCHAR(255) NOT NULL DEFAULT 'api',
            "teamId" UUID,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_guard_tenant
        ON roles (name, "guardName", COALESCE("teamId", '00000000-0000-0000-0000-000000000000'));
    `);

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS permissions (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            "guardName" VARCHAR(255) NOT NULL DEFAULT 'api',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_name_guard
        ON permissions (name, "guardName");
    `);

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS role_has_permissions (
            id UUID PRIMARY KEY,
            "roleId" UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            "permissionId" UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE
        );
    `);
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_role_has_permissions_unique
        ON role_has_permissions ("roleId", "permissionId");
    `);

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS model_has_roles (
            id UUID PRIMARY KEY,
            "roleId" UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            "modelType" VARCHAR(255) NOT NULL,
            "modelId" VARCHAR(255) NOT NULL,
            "teamId" UUID
        );
    `);
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_model_has_roles_unique
        ON model_has_roles ("roleId", "modelType", "modelId", COALESCE("teamId", '00000000-0000-0000-0000-000000000000'));
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_model_has_roles_lookup
        ON model_has_roles ("modelType", "modelId");
    `);

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS model_has_permissions (
            id UUID PRIMARY KEY,
            "permissionId" UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            "modelType" VARCHAR(255) NOT NULL,
            "modelId" VARCHAR(255) NOT NULL,
            "teamId" UUID
        );
    `);
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_model_has_permissions_unique
        ON model_has_permissions ("permissionId", "modelType", "modelId", COALESCE("teamId", '00000000-0000-0000-0000-000000000000'));
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_model_has_permissions_lookup
        ON model_has_permissions ("modelType", "modelId");
    `);

    console.log("✓ Migration completed: roles/permissions tables created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS model_has_permissions CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS model_has_roles CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS role_has_permissions CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS permissions CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS roles CASCADE;`);
    console.log("✓ Migration rolled back: roles/permissions tables dropped");
}
