import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../database/connection";
import { docs } from "../../app/models/doc.model";
import { run as seedDocs } from "../../database/seeders/doc.seeder";

/**
 * Runs the real seeder against a real MySQL database (vitest.config.ts's
 * test.env points DB_NAME at a dedicated nyaladocs_test database — see
 * that file's comment for why it's shared across spec files, reset per
 * file, rather than a true per-file isolated database) and the real
 * website/docs/*.md tree — the same files database/seed.ts reads in
 * production. Not a fixture: this proves the seeder actually produces
 * genuine, non-empty documentation content, not just that it doesn't
 * crash.
 */
describe("doc.seeder", () => {
    beforeAll(async () => {
        await db.execute(sql`DROP TABLE IF EXISTS docs`);
        await db.execute(sql`
            CREATE TABLE docs (
                id VARCHAR(36) PRIMARY KEY,
                slug VARCHAR(255) NOT NULL UNIQUE,
                title VARCHAR(255) NOT NULL,
                group_title VARCHAR(255) NOT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        `);
    });

    afterAll(async () => {
        await db.execute(sql`DELETE FROM docs`);
    });

    it("seeds real rows from the real website/docs/*.md files", async () => {
        await seedDocs();

        const rows = await db.select().from(docs);
        expect(rows.length).toBeGreaterThan(40); // 52 real files as of this writing — >40 tolerates future additions/removals without being a brittle exact match

        const intro = rows.find((row) => row.slug === "introduction");
        expect(intro).toBeDefined();
        expect(intro?.content.length).toBeGreaterThan(100);
        expect(intro?.groupTitle).toBe("Getting Started");
    });

    it("is idempotent — re-running doesn't duplicate rows", async () => {
        const before = (await db.select().from(docs)).length;
        await seedDocs();
        const after = (await db.select().from(docs)).length;
        expect(after).toBe(before);
    });
});
