import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS posts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            excerpt TEXT,
            content TEXT NOT NULL,
            cover_image_url VARCHAR(512),
            category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            published_at TIMESTAMP,
            meta_title VARCHAR(255),
            meta_description TEXT,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_posts_category_id ON posts(category_id);`);
    console.log("✓ Migration completed: posts table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS posts CASCADE;`);
    console.log("✓ Migration rolled back: posts table dropped");
}
