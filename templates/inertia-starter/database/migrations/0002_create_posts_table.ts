import { sql } from "drizzle-orm";

/** Migration: Create Posts Table (SQLite dialect). */

export async function up(db: any) {
    db.run(sql`
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            published INTEGER NOT NULL DEFAULT 0,
            author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);

    db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);`);
    db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);`);

    console.log("✓ Migration completed: posts table created");
}

export async function down(db: any) {
    db.run(sql`DROP TABLE IF EXISTS posts;`);
    console.log("✓ Migration rolled back: posts table dropped");
}
