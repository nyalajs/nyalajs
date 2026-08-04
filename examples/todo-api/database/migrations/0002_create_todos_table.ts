import { sql } from "drizzle-orm";

/**
 * Migration: Create Todos Table
 *
 * Creates the todos table with a foreign key to users and supporting indexes.
 */

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS todos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            completed BOOLEAN DEFAULT false NOT NULL,
            due_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);

    // Create indexes
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
        CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
        CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
    `);

    console.log("✓ Migration completed: todos table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS todos CASCADE;`);
    console.log("✓ Migration rolled back: todos table dropped");
}
