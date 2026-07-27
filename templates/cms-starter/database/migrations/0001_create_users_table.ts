import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'editor',
            avatar_url VARCHAR(512),
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    console.log("✓ Migration completed: users table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS users CASCADE;`);
    console.log("✓ Migration rolled back: users table dropped");
}
