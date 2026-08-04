import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            blocks JSONB NOT NULL DEFAULT '[]',
            meta_title VARCHAR(255),
            meta_description TEXT,
            og_image VARCHAR(512),
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            published_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);`);
    console.log("✓ Migration completed: pages table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS pages CASCADE;`);
    console.log("✓ Migration rolled back: pages table dropped");
}
