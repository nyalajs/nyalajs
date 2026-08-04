import { sql } from "drizzle-orm";

/**
 * Migration: Create Tickets and Ticket Comments Tables
 *
 * Tables:
 * - tickets: Multi-tenant support tickets
 * - ticket_comments: Comments/replies on a ticket
 */

export async function up(db: any) {
    // Create tickets table
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS tickets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            subject VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'open' NOT NULL,
            priority VARCHAR(20) DEFAULT 'medium' NOT NULL,
            created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);

    // Create indexes on tickets table
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status ON tickets(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_tickets_tenant_priority ON tickets(tenant_id, priority);
        CREATE INDEX IF NOT EXISTS idx_tickets_created_by_id ON tickets(created_by_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to_id ON tickets(assigned_to_id);
    `);

    // Create ticket_comments table
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ticket_comments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);

    // Create indexes on ticket_comments table
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_ticket_comments_tenant_id ON ticket_comments(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_ticket_comments_tenant_ticket ON ticket_comments(tenant_id, ticket_id);
    `);

    console.log("✔ Migration completed: tickets, ticket_comments tables created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS ticket_comments CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS tickets CASCADE;`);

    console.log("✔ Migration rolled back: tickets, ticket_comments tables dropped");
}
