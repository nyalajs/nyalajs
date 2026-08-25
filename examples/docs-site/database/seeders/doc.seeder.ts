import * as fs from "fs/promises";
import * as path from "path";
import { db } from "../connection";
import { docs } from "../../app/models/doc.model";
import { docsNav } from "../../app/docs/nav";
import { randomUUID } from "crypto";

/**
 * Seeds the docs table with the real content from website/docs/*.md —
 * this is what makes `npm run db:seed` produce genuine documentation
 * instead of empty tables or lorem-ipsum placeholders. docsNav supplies
 * the group/order metadata (mirrors the real VitePress sidebar — see
 * app/docs/nav.ts's own doc comment); this seeder reads each listed
 * file's actual raw markdown as the row's `content`.
 *
 * Idempotent via .ignore() (MySQL's INSERT IGNORE) on the unique `slug`
 * column — same idea as inertia-starter's post.seeder.ts
 * onConflictDoNothing(), but that method doesn't exist on MySQL's insert
 * builder at all (verified against drizzle-orm/mysql-core's real
 * .d.ts — no ON CONFLICT in MySQL's dialect, only INSERT IGNORE /
 * ON DUPLICATE KEY UPDATE). Safe to re-run.
 */
export async function run(): Promise<void> {
    console.log("Seeding docs from website/docs/...");

    const sourceDir = path.resolve(__dirname, "../../../../website/docs");
    const now = new Date();

    let seeded = 0;
    let skipped = 0;

    for (const group of docsNav) {
        for (const [index, item] of group.items.entries()) {
            const filePath = path.join(sourceDir, `${item.slug}.md`);

            let content: string;
            try {
                content = await fs.readFile(filePath, "utf-8");
            } catch {
                console.log(`  skipped "${item.slug}" — no file at ${filePath}`);
                skipped++;
                continue;
            }

            const [result] = await db
                .insert(docs)
                .ignore()
                .values({
                    id: randomUUID(),
                    slug: item.slug,
                    title: item.title,
                    groupTitle: group.title,
                    sortOrder: index,
                    content,
                    createdAt: now,
                    updatedAt: now,
                });

            if ((result as any).affectedRows > 0) seeded++;
        }
    }

    console.log(`✓ Seeded ${seeded} docs${skipped > 0 ? ` (${skipped} source files missing)` : ""}`);
}
