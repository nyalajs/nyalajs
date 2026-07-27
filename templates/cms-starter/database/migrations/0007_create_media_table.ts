import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS media (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            filename VARCHAR(255) NOT NULL,
            url VARCHAR(1024) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            size INTEGER NOT NULL,
            alt_text VARCHAR(255),
            uploaded_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);
    console.log("✓ Migration completed: media table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS media CASCADE;`);
    console.log("✓ Migration rolled back: media table dropped");
}
