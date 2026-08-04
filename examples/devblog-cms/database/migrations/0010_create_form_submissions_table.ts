import { sql } from "drizzle-orm";

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS form_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            form_name VARCHAR(100) NOT NULL,
            data JSONB NOT NULL,
            ip VARCHAR(64),
            user_agent VARCHAR(512),
            read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_form_submissions_read ON form_submissions(read);`);
    console.log("✓ Migration completed: form_submissions table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS form_submissions CASCADE;`);
    console.log("✓ Migration rolled back: form_submissions table dropped");
}
