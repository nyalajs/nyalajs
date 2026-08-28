import { sql } from "drizzle-orm";

/**
 * Adds the subscriptions table — one row per tenant's current billing
 * state, kept in sync by BillingController's webhook handler.
 */

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
            plan VARCHAR(50) NOT NULL DEFAULT 'free',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            gateway VARCHAR(50),
            gateway_reference VARCHAR(255),
            current_period_ends_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON subscriptions(tenant_id);
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_subscriptions_gateway_reference ON subscriptions(gateway_reference);
    `);

    console.log("✔ Migration completed: subscriptions table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS subscriptions CASCADE;`);
    console.log("✔ Migration rolled back");
}
