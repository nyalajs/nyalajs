import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(100) PRIMARY KEY,
            value JSONB NOT NULL
        );
    `);
    console.log("✓ Migration completed: settings table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS settings CASCADE;`);
    console.log("✓ Migration rolled back: settings table dropped");
}
