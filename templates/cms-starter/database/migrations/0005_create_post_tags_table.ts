import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS post_tags (
            post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (post_id, tag_id)
        );
    `);
    console.log("✓ Migration completed: post_tags table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS post_tags CASCADE;`);
    console.log("✓ Migration rolled back: post_tags table dropped");
}
