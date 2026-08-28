import { sql } from "drizzle-orm";

/**
 * Adds everything the tenant lifecycle (invites), auth completeness
 * (email verification, password reset), and RBAC (@nyalajs/permissions)
 * features need.
 *
 * The roles/permissions/model_has_roles/model_has_permissions/
 * role_has_permissions tables are copied verbatim from
 * @nyalajs/permissions' own migration template
 * (node_modules/@nyalajs/permissions/migrations/create_permissions_tables.ts)
 * — column names are camelCase there and MUST stay that way: they're read
 * by @nyalajs/database's Model/SchemaRegistry, which maps a decorated
 * property directly to a same-named column, with no camelCase->snake_case
 * translation. Every other table in this migration follows this template's
 * own snake_case convention instead, matching 0001_initial.ts — the two
 * conventions correctly coexist in the same database; they're just two
 * different packages' tables.
 */

export async function up(db: any) {
    // ---- Team invites (tenant lifecycle) ----
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS team_invites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            invited_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'member',
            token VARCHAR(255) NOT NULL UNIQUE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            expires_at TIMESTAMP NOT NULL,
            accepted_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_team_invites_tenant_id ON team_invites(tenant_id);
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
    `);
    // One PENDING invite per (tenant, email) at a time — re-inviting after
    // a decline/expiry is fine, having two simultaneously-pending invites
    // to the same address is not. A partial unique index (not a plain
    // UNIQUE constraint on tenant_id+email) is what allows that: multiple
    // historical accepted/declined/expired rows for the same address are
    // allowed, only "pending" is constrained to one.
    await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_pending_unique
        ON team_invites(tenant_id, email)
        WHERE status = 'pending';
    `);

    // ---- Email verification tokens (auth completeness) ----
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(255) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
    `);

    // ---- Password reset tokens (auth completeness) ----
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(255) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
    `);

    // ---- RBAC (@nyalajs/permissions) — copied from the package's own migration template ----
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

    console.log("✔ Migration completed: team_invites, email_verification_tokens, password_reset_tokens, roles/permissions tables created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS model_has_permissions CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS model_has_roles CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS role_has_permissions CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS permissions CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS roles CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS password_reset_tokens CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS email_verification_tokens CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS team_invites CASCADE;`);

    console.log("✔ Migration rolled back");
}
