import { sql } from "drizzle-orm";

/**
 * Migration: Create Docs Table (MySQL dialect — see database/migrate.ts's
 * doc comment for why this app runs migrations directly instead of via
 * `nyala db:migrate`). Matches app/models/doc.model.ts's schema exactly.
 *
 * Indexes are declared inline in CREATE TABLE rather than as separate
 * CREATE INDEX statements — MySQL's CREATE INDEX doesn't support
 * IF NOT EXISTS the way SQLite's does, so a plain "CREATE INDEX ..."
 * would fail on a second run instead of being a no-op; the unique
 * constraint on `slug` already gives it an index for free, and a
 * standalone KEY clause on `group_title` covers the nav-grouping query
 * (DocRepository.findAllOrdered()).
 */

export async function up(db: any) {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS docs (
            id VARCHAR(36) PRIMARY KEY,
            slug VARCHAR(255) NOT NULL UNIQUE,
            title VARCHAR(255) NOT NULL,
            group_title VARCHAR(255) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            content TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,
            KEY idx_docs_group_title (group_title)
        );
    `);

    console.log("✓ Migration completed: docs table created");
}

export async function down(db: any) {
    await db.execute(sql`DROP TABLE IF EXISTS docs;`);
    console.log("✓ Migration rolled back: docs table dropped");
}
