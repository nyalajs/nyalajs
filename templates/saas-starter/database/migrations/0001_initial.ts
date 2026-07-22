import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, timestamp, text, boolean } from "drizzle-orm/pg-core";

/**
 * Initial migration - Create core tables for multi-tenant SaaS
 *
 * Tables:
 * - tenants: Multi-tenant support
 * - users: User accounts with tenant association
 * - audit_logs: Audit trail for compliance
 */

export async function up(db: any) {
    // Create tenants table
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS tenants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            status VARCHAR(50) DEFAULT 'active',
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Create index on tenant slug for fast lookups
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    `);

    // Create users table
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tena      );
    `);

    // Create indexes on users table
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
    `);

    // Create audit_logs table
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(255) NOT NULL,
            resource_type VARCHAR(100),
            resource_id VARCHAR(255),
            metadata JSONB DEFAULT '{}',
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Create indexes on audit_logs for efficient queries
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    `);

    // Create refresh_tokens table for JWT refresh token storage
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(500) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            revoked BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Create indexes on refresh_tokens
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
    `);

    console.log("✔ Initial migration completed: tenants, users, audit_logs, refresh_tokens tables created");
}

export async function down(db: any) {
    // Drop tables in reverse order (respect foreign key constraints)
    await db.execute(sql`DROP TABLE IF EXISTS refresh_tokens CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS audit_logs CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS users CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS tenants CASCADE;`);

    console.log("✔ Initial migration rolled back");
}
