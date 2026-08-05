import { sql } from "drizzle-orm";

/**
 * Migration: Create Users Table (SQLite dialect — see database/migrate.ts's
 * doc comment for why this starter runs migrations directly instead of via
 * `nyala db:migrate`).
 */

export async function up(db: any) {
    db.run(sql`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            email_verified_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);

    db.run(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    db.run(sql`CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);`);

    console.log("✓ Migration completed: users table created");
}

export async function down(db: any) {
    db.run(sql`DROP TABLE IF EXISTS users;`);
    console.log("✓ Migration rolled back: users table dropped");
}
