import { sql } from "drizzle-orm";

/**
 * Migration: Create Docs Table (SQLite dialect — see database/migrate.ts's
 * doc comment for why this app runs migrations directly instead of via
 * `nyala db:migrate`). Matches app/models/doc.model.ts's schema exactly.
 */

export async function up(db: any) {
    db.run(sql`
        CREATE TABLE IF NOT EXISTS docs (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            group_title TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);

    db.run(sql`CREATE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug);`);
    db.run(sql`CREATE INDEX IF NOT EXISTS idx_docs_group_title ON docs(group_title);`);

    console.log("✓ Migration completed: docs table created");
}

export async function down(db: any) {
    db.run(sql`DROP TABLE IF EXISTS docs;`);
    console.log("✓ Migration rolled back: docs table dropped");
}
