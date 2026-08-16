import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../database/connection";
import { docs } from "../../app/models/doc.model";
import { run as seedDocs } from "../../database/seeders/doc.seeder";

/**
 * Runs the real seeder against a real SQLite file (vitest.config.ts's
 * test.env.DB_PATH — see that file's comment for why it's a shared test
 * DB, reset per spec file, rather than a true per-file temp file) and the
 * real website/docs/*.md tree — the same files database/seed.ts reads in
 * production. Not a fixture: this proves the seeder actually produces
 * genuine, non-empty documentation content, not just that it doesn't
 * crash.
 */
describe("doc.seeder", () => {
    beforeAll(() => {
        db.run(sql`DROP TABLE IF EXISTS docs`);
        db.run(sql`
            CREATE TABLE docs (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                group_title TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);
    });

    afterAll(() => {
        db.run(sql`DELETE FROM docs`);
    });

    it("seeds real rows from the real website/docs/*.md files", async () => {
        await seedDocs();

        const rows = db.select().from(docs).all();
        expect(rows.length).toBeGreaterThan(40); // 52 real files as of this writing — >40 tolerates future additions/removals without being a brittle exact match

        const intro = rows.find((row) => row.slug === "introduction");
        expect(intro).toBeDefined();
        expect(intro?.content.length).toBeGreaterThan(100);
        expect(intro?.groupTitle).toBe("Getting Started");
    });

    it("is idempotent — re-running doesn't duplicate rows", async () => {
        const before = db.select().from(docs).all().length;
        await seedDocs();
        const after = db.select().from(docs).all().length;
        expect(after).toBe(before);
    });
});
