import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS tags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE
        );
    `);
    console.log("✓ Migration completed: tags table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS tags CASCADE;`);
    console.log("✓ Migration rolled back: tags table dropped");
}
