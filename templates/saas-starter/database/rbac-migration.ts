import postgres from "postgres";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Copies one tenant's RBAC data (@nyalajs/permissions' roles/
 * model_has_roles/model_has_permissions, plus every permission and
 * role_has_permissions row those roles actually reference) from the shared
 * database to a freshly-provisioned dedicated tenant database.
 *
 * This exists because TenantMigrationService (the framework's own
 * shared<->dedicated copy engine) only recognizes tables with a literal
 * `tenantId` column — @nyalajs/permissions' tables are deliberately keyed
 * by `teamId` instead (see Role's own doc comment: this is what lets a
 * team-scoped role coexist with @nyalajs/database's automatic
 * tenant-scoping without colliding with it), so TenantMigrationService
 * can't see or copy them at all. Without this, a tenant migrated to
 * dedicated keeps working for plain reads/writes but 500s on the very
 * first request that hits a role check (DBRolesGuard/@Roles()) — confirmed
 * against a real migration.
 *
 * `sourceDb` is this app's own Drizzle instance (from database/connection.ts
 * — NOT a raw `postgres` client, so plain SELECT/INSERT here go through
 * `db.execute(sql\`...\`)`, Drizzle's own raw-SQL escape hatch, rather than
 * tagged-template calls directly on a `postgres` client). The TARGET
 * connection, by contrast, is opened here as a genuinely raw `postgres`
 * client — simpler for this one-shot copy than also standing up a second
 * Drizzle instance just to immediately throw it away.
 *
 * `permissions` rows are copied by ID, not filtered by tenant (permission
 * DEFINITIONS — e.g. "invoices.create" — are global, shared across every
 * tenant; only role MEMBERSHIP is tenant/team-scoped) — an INSERT ... ON
 * CONFLICT (id) DO NOTHING, so re-running this (e.g. a retried migration)
 * never duplicates or errors on a permission that already exists on the
 * target from a previous tenant's migration.
 */
export async function copyTenantRbacData(
    sourceDb: PostgresJsDatabase,
    targetConnectionString: string,
    tenantId: string
): Promise<{ rolesCopied: number; permissionGrantsCopied: number }> {
    const target = postgres(targetConnectionString, { max: 1 });

    try {
        await ensureRbacSchema(target);

        const roles = await selectRows(sourceDb, sql`SELECT * FROM roles WHERE "teamId" = ${tenantId}`);
        const roleIds = roles.map((r) => r.id);

        const modelHasRoles = await selectRows(sourceDb, sql`SELECT * FROM model_has_roles WHERE "teamId" = ${tenantId}`);
        const modelHasPermissions = await selectRows(sourceDb, sql`SELECT * FROM model_has_permissions WHERE "teamId" = ${tenantId}`);

        // sql.join(...) + IN (...), not ANY(${array}) — Drizzle's sql
        // template tag expands a JS array interpolated directly into a
        // query as multiple positional params (a bare tuple, `($1, $2)`),
        // not a single array-typed parameter, so ANY($1) never receives
        // the array shape it needs no matter how it's cast. Confirmed
        // against a real query: both `ANY(${arr})` and `ANY(${arr}::uuid[])`
        // fail with a driver-level error; `IN (${sql.join(ids.map(id =>
        // sql`${id}`), sql.raw(", "))})` is the form that actually works.
        const roleHasPermissions =
            roleIds.length > 0
                ? await selectRows(
                      sourceDb,
                      sql`SELECT * FROM role_has_permissions WHERE "roleId" IN (${sql.join(
                          roleIds.map((id) => sql`${id}`),
                          sql.raw(", ")
                      )})`
                  )
                : [];

        const permissionIds = [...new Set(roleHasPermissions.map((rhp: any) => rhp.permissionId))];
        const permissions =
            permissionIds.length > 0
                ? await selectRows(
                      sourceDb,
                      sql`SELECT * FROM permissions WHERE id IN (${sql.join(
                          permissionIds.map((id) => sql`${id}`),
                          sql.raw(", ")
                      )})`
                  )
                : [];

        for (const p of permissions) {
            await target`
                INSERT INTO permissions (id, name, "guardName", "createdAt", "updatedAt")
                VALUES (${p.id}, ${p.name}, ${p.guardName}, ${p.createdAt}, ${p.updatedAt})
                ON CONFLICT (id) DO NOTHING
            `;
        }

        for (const r of roles) {
            await target`
                INSERT INTO roles (id, name, "guardName", "teamId", "createdAt", "updatedAt")
                VALUES (${r.id}, ${r.name}, ${r.guardName}, ${r.teamId}, ${r.createdAt}, ${r.updatedAt})
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"
            `;
        }

        for (const mhr of modelHasRoles) {
            await target`
                INSERT INTO model_has_roles (id, "roleId", "modelType", "modelId", "teamId")
                VALUES (${mhr.id}, ${mhr.roleId}, ${mhr.modelType}, ${mhr.modelId}, ${mhr.teamId})
                ON CONFLICT (id) DO NOTHING
            `;
        }

        for (const mhp of modelHasPermissions) {
            await target`
                INSERT INTO model_has_permissions (id, "permissionId", "modelType", "modelId", "teamId")
                VALUES (${mhp.id}, ${mhp.permissionId}, ${mhp.modelType}, ${mhp.modelId}, ${mhp.teamId})
                ON CONFLICT (id) DO NOTHING
            `;
        }

        for (const rhp of roleHasPermissions) {
            await target`
                INSERT INTO role_has_permissions (id, "roleId", "permissionId")
                VALUES (${rhp.id}, ${rhp.roleId}, ${rhp.permissionId})
                ON CONFLICT (id) DO NOTHING
            `;
        }

        return {
            rolesCopied: roles.length,
            permissionGrantsCopied: modelHasRoles.length + modelHasPermissions.length + roleHasPermissions.length,
        };
    } finally {
        await target.end();
    }
}

/** Runs a raw parameterized SELECT through Drizzle's db.execute() and returns its rows as plain objects, regardless of exactly which shape postgres-js's execute() result wraps them in. */
async function selectRows(db: PostgresJsDatabase, query: ReturnType<typeof sql>): Promise<any[]> {
    const result: any = await db.execute(query);
    return Array.isArray(result) ? result : (result.rows ?? []);
}

/**
 * Creates the RBAC tables on the target if they don't already exist — the
 * exact same DDL as `database/migrations/0002_tenant_lifecycle_and_rbac.ts`
 * (kept in sync manually; there are only 5 small tables here). A dedicated
 * tenant database needs these even though it will only ever hold ONE
 * tenant's rows, since @nyalajs/permissions' Model classes query them
 * unconditionally wherever ConnectionContext points.
 */
async function ensureRbacSchema(target: postgres.Sql): Promise<void> {
    await target`
        CREATE TABLE IF NOT EXISTS roles (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            "guardName" VARCHAR(255) NOT NULL DEFAULT 'api',
            "teamId" UUID,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `;
    await target`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_guard_tenant
        ON roles (name, "guardName", COALESCE("teamId", '00000000-0000-0000-0000-000000000000'))
    `;

    await target`
        CREATE TABLE IF NOT EXISTS permissions (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            "guardName" VARCHAR(255) NOT NULL DEFAULT 'api',
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `;
    await target`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_name_guard
        ON permissions (name, "guardName")
    `;

    await target`
        CREATE TABLE IF NOT EXISTS role_has_permissions (
            id UUID PRIMARY KEY,
            "roleId" UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            "permissionId" UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE
        )
    `;
    await target`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_role_has_permissions_unique
        ON role_has_permissions ("roleId", "permissionId")
    `;

    await target`
        CREATE TABLE IF NOT EXISTS model_has_roles (
            id UUID PRIMARY KEY,
            "roleId" UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            "modelType" VARCHAR(255) NOT NULL,
            "modelId" VARCHAR(255) NOT NULL,
            "teamId" UUID
        )
    `;
    await target`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_model_has_roles_unique
        ON model_has_roles ("roleId", "modelType", "modelId", COALESCE("teamId", '00000000-0000-0000-0000-000000000000'))
    `;

    await target`
        CREATE TABLE IF NOT EXISTS model_has_permissions (
            id UUID PRIMARY KEY,
            "permissionId" UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            "modelType" VARCHAR(255) NOT NULL,
            "modelId" VARCHAR(255) NOT NULL,
            "teamId" UUID
        )
    `;
    await target`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_model_has_permissions_unique
        ON model_has_permissions ("permissionId", "modelType", "modelId", COALESCE("teamId", '00000000-0000-0000-0000-000000000000'))
    `;
}
