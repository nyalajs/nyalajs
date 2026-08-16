import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../database/connection";
import { DocRepository } from "../../app/repositories/doc.repository";
import { DocsService, __setCodeToHtmlForTests } from "../../app/services/docs.service";

/**
 * Runs against a real SQLite file (vitest.config.ts's test.env.DB_PATH) —
 * not mocked queries — since DocsService/DocRepository's whole job is
 * reading/writing real rows. Mocking the repository here would just be
 * testing that the mocks return what they were told to return. Drops and
 * recreates the docs table itself in beforeAll (rather than assuming a
 * fresh file) for real isolation regardless of what other spec files ran
 * against this same shared test DB — see vitest.config.ts's comment for
 * why it's shared instead of a true per-file temp file.
 *
 * shiki itself is swapped for a lightweight real function via
 * __setCodeToHtmlForTests(), not mocked away entirely — Vitest's module
 * runner can't execute the app's real dynamic import("shiki") (throws
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING; confirmed this is a vite-node VM
 * sandbox limitation, not a bug — the same code runs correctly under plain
 * Node, verified by running the compiled server against all 52 real seeded
 * docs). What's actually under test here is DocsService's own rendering
 * logic (placeholder substitution, language aliasing, heading dedup, link
 * rewriting) and DocRepository's real CRUD queries, not Shiki's rendering.
 */
describe("DocsService + DocRepository", () => {
    let repo: DocRepository;
    let service: DocsService;

    beforeAll(async () => {
        __setCodeToHtmlForTests((code, options) => {
            const lang = typeof options?.lang === "string" ? options.lang : "text";
            return Promise.resolve(
                `<pre class="shiki fake-test-highlighter" data-lang="${lang}"><code>${code}</code></pre>`
            );
        });

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

        repo = new DocRepository();
        service = new DocsService(repo);

        await repo.createDoc({
            slug: "introduction",
            title: "Introduction",
            groupTitle: "Getting Started",
            sortOrder: 0,
            content: [
                "# Introduction",
                "",
                "This is the real first paragraph, used as the search excerpt.",
                "",
                "## Installation",
                "",
                "```bash",
                "npm install",
                "```",
                "",
                "## Configuration",
                "",
                "See [installation](./installation) for setup.",
                "",
                "## Installation",
                "",
                "A second heading with the same text, to check id de-duplication.",
            ].join("\n"),
        });

        await repo.createDoc({
            slug: "installation",
            title: "Installation",
            groupTitle: "Getting Started",
            sortOrder: 1,
            content: ["# Installation", "", "Install steps.", "", "```env", "SESSION_SECRET=change-me", "```"].join(
                "\n"
            ),
        });
    });

    afterAll(() => {
        __setCodeToHtmlForTests(null);
    });

    describe("DocRepository CRUD", () => {
        it("finds a real row by slug", async () => {
            const doc = await repo.findBySlug("introduction");
            expect(doc?.title).toBe("Introduction");
        });

        it("returns null for a slug with no matching row", async () => {
            expect(await repo.findBySlug("does-not-exist")).toBeNull();
        });

        it("creates, updates, and deletes a real row", async () => {
            const created = await repo.createDoc({
                slug: "crud-lifecycle-test",
                title: "Lifecycle",
                groupTitle: "Testing",
                sortOrder: 99,
                content: "# Lifecycle",
            });
            expect(created.id).toBeTruthy();

            const updated = await repo.update(created.id, { title: "Updated Lifecycle" });
            expect(updated?.title).toBe("Updated Lifecycle");

            const deleted = await repo.delete(created.id);
            expect(deleted).toBe(true);
            expect(await repo.findBySlug("crud-lifecycle-test")).toBeNull();
        });

        it("detects a slug collision, excluding the row's own id", async () => {
            const doc = await repo.findBySlug("introduction");
            expect(await repo.slugExists("introduction")).toBe(true);
            expect(await repo.slugExists("introduction", doc!.id)).toBe(false);
            expect(await repo.slugExists("does-not-exist")).toBe(false);
        });
    });

    describe("DocsService.render", () => {
        it("returns null for a slug with no matching row", async () => {
            expect(await service.render("does-not-exist")).toBeNull();
        });

        it("extracts the real title from the row", async () => {
            const rendered = await service.render("introduction");
            expect(rendered?.title).toBe("Introduction");
        });

        it("renders real markdown content to real HTML", async () => {
            const rendered = await service.render("introduction");
            expect(rendered?.html).toContain("<h1");
            expect(rendered?.html).toContain("This is the real first paragraph");
        });

        it("routes fenced code blocks through the highlighter with the right language", async () => {
            const rendered = await service.render("introduction");
            expect(rendered?.html).toContain('data-lang="bash"');
            expect(rendered?.html).toContain("npm install");
        });

        it("remaps the env fence language to shiki's real dotenv grammar instead of passing 'env' through", async () => {
            // Regression test for a real bug: shiki has no "env" grammar
            // (confirmed against its bundledLanguages), and the original
            // website/docs/*.md source (seeded into this table by
            // database/seeders/doc.seeder.ts) fences plenty of blocks as
            // ```env — rendering one used to throw ShikiError before the
            // LANG_ALIASES fix. Asserting on data-lang (not just that
            // rendering succeeded) proves the alias actually reaches
            // codeToHtml's options, not just that some fallback silently
            // avoided the error.
            const rendered = await service.render("installation");
            expect(rendered?.html).toContain('data-lang="dotenv"');
            expect(rendered?.html).not.toContain('data-lang="env"');
            expect(rendered?.html).toContain("SESSION_SECRET");
        });

        it("excludes the H1 from the returned headings list", async () => {
            const rendered = await service.render("introduction");
            expect(rendered?.headings.every((h) => h.depth > 1)).toBe(true);
        });

        it("de-duplicates heading ids for repeated heading text", async () => {
            const rendered = await service.render("introduction");
            const ids = rendered?.headings.map((h) => h.id) ?? [];
            expect(ids).toContain("installation");
            expect(ids).toContain("installation-1");
            expect(new Set(ids).size).toBe(ids.length);
        });

        it("rewrites a relative markdown link to a /docs/:slug route", async () => {
            const rendered = await service.render("introduction");
            expect(rendered?.html).toContain('href="/docs/installation"');
        });
    });

    describe("DocsService.getNav", () => {
        it("groups real rows by their real groupTitle", async () => {
            const nav = await service.getNav();
            const gettingStarted = nav.find((group) => group.title === "Getting Started");
            expect(gettingStarted?.items.map((i) => i.slug)).toEqual(
                expect.arrayContaining(["introduction", "installation"])
            );
        });
    });

    describe("DocsService.getAdjacent", () => {
        it("returns null prev for the first real doc in order", async () => {
            const { prev } = await service.getAdjacent("introduction");
            expect(prev).toBeNull();
        });

        it("returns the real next doc", async () => {
            const { next } = await service.getAdjacent("introduction");
            expect(next?.slug).toBe("installation");
        });

        it("returns null for both when the slug doesn't exist", async () => {
            const { prev, next } = await service.getAdjacent("not-a-real-slug");
            expect(prev).toBeNull();
            expect(next).toBeNull();
        });
    });

    describe("DocsService.search", () => {
        it("finds real rows by title/content/group substring match", async () => {
            const results = await service.search("first paragraph");
            expect(results.some((r) => r.slug === "introduction")).toBe(true);
        });

        it("returns an empty array for an empty query instead of every row", async () => {
            expect(await service.search("")).toEqual([]);
        });

        it("builds excerpts from each row's real first paragraph", async () => {
            const results = await service.search("introduction");
            const intro = results.find((r) => r.slug === "introduction");
            expect(intro?.excerpt).toContain("real first paragraph");
        });
    });
});
