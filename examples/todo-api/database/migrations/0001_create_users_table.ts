import { sql } from "drizzle-orm";

/**
 * Migration: Create Users Table
 *
 * Creates the users table with all necessary columns and indexes.
 */

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT true NOT NULL,
            email_verified_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);

    // Create indexes
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
        CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    `);

    console.log("✓ Migration completed: users table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS users CASCADE;`);
    console.log("✓ Migration rolled back: users table dropped");
}
