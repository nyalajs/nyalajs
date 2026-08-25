import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../database/connection";
import { DocRepository } from "../../app/repositories/doc.repository";
import { DocsService, __setCodeToHtmlForTests } from "../../app/services/docs.service";

/**
 * Runs against a real MySQL database (vitest.config.ts's test.env points
 * DB_NAME at a dedicated nyaladocs_test database, separate from this app's
 * real nyaladocs one) — not mocked queries — since
 * DocsService/DocRepository's whole job is reading/writing real rows.
 * Mocking the repository here would just be testing that the mocks return
 * what they were told to return. Drops and recreates the docs table
 * itself in beforeAll (rather than assuming a clean database) for real
 * isolation regardless of what other spec files ran against this same
 * shared test database — see vitest.config.ts's comment for why it's
 * shared instead of a true per-file isolated database.
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
            // LANG_ALIASES fix. Checking the fake highlighter's own
            // <pre data-lang="..."> (not wrapCodeBlock()'s outer
            // <div data-lang="...">, which intentionally carries the
            // original un-aliased fence language for display — see that
            // function's doc comment) proves the alias actually reaches
            // codeToHtml's options, not just that some fallback silently
            // avoided the error.
            const rendered = await service.render("installation");
            expect(rendered?.html).toContain('<pre class="shiki fake-test-highlighter" data-lang="dotenv">');
            expect(rendered?.html).not.toContain('<pre class="shiki fake-test-highlighter" data-lang="env">');
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

        it("keeps the id attribute on rendered heading tags after sanitizing", async () => {
            // Regression test for a real bug: the `headings` array
            // (asserted above) is built straight from marked's own
            // tokenizer, independent of SANITIZE_OPTIONS — it stayed
            // correct even when a broken allowedAttributes key
            // ("h1,h2,h3,h4,h5,h6" as one literal object key, which
            // sanitize-html's real index.js treats as a single tag name
            // that matches nothing, not a comma-separated list of six
            // tags) silently stripped `id` off every actual <h2>/<h3> in
            // the rendered `html` string. DocsOutline's "On this page"
            // links point at #<id> anchors built from that `headings`
            // array — when the id was missing from the real DOM, clicking
            // one updated the URL hash but scrolled nowhere (no element
            // to jump to). Asserting on the rendered HTML itself, not
            // just the parallel `headings` data, is what actually catches
            // that gap.
            const rendered = await service.render("introduction");
            expect(rendered?.html).toContain('<h2 id="installation">');
        });

        it("rewrites a relative markdown link to a /docs/:slug route", async () => {
            const rendered = await service.render("introduction");
            expect(rendered?.html).toContain('href="/docs/installation"');
        });
    });

    describe("DocsService.render — HTML sanitization", () => {
        // Regression test: `content` is fully user-writable (only gated by
        // AdminGuard, not by any content restriction — see
        // DocsController.create()/update()) and rendered via
        // dangerouslySetInnerHTML for every visitor (Docs/Show.tsx), so a
        // malicious doc submission must never be able to inject a live
        // <script> or event handler into the page other visitors load.
        it("strips a raw <script> tag embedded in doc content", async () => {
            await repo.createDoc({
                slug: "xss-script-test",
                title: "XSS Script Test",
                groupTitle: "Testing",
                sortOrder: 0,
                content: [
                    "# XSS Script Test",
                    "",
                    "Before.",
                    "",
                    '<script>window.__xss = "pwned";</script>',
                    "",
                    "After.",
                ].join("\n"),
            });

            const rendered = await service.render("xss-script-test");
            expect(rendered?.html).not.toContain("<script");
            expect(rendered?.html).not.toContain("__xss");
            expect(rendered?.html).toContain("Before.");
            expect(rendered?.html).toContain("After.");
        });

        it("strips an onerror handler off an <img> tag embedded in doc content", async () => {
            // Slug/title deliberately avoid the substring "onerror" —
            // the heading-id fix above means the H1's real id="..." is
            // derived from this doc's own title/slug (see docs.service.ts's
            // slugify()), so a slug like "xss-onerror-test" would make
            // this test's own not.toContain("onerror") check trip on the
            // id itself, not the (correctly stripped) attack payload.
            await repo.createDoc({
                slug: "xss-event-handler-test",
                title: "XSS Event Handler Test",
                groupTitle: "Testing",
                sortOrder: 0,
                content: ["# XSS Event Handler Test", "", '<img src="x" onerror="alert(1)">'].join("\n"),
            });

            const rendered = await service.render("xss-event-handler-test");
            expect(rendered?.html).not.toContain("onerror");
            expect(rendered?.html).not.toContain("alert(1)");
        });

        it("strips a javascript: URL from a markdown link", async () => {
            await repo.createDoc({
                slug: "xss-link-test",
                title: "XSS Link Test",
                groupTitle: "Testing",
                sortOrder: 0,
                content: ["# XSS Link Test", "", "[click me](javascript:alert(1))"].join("\n"),
            });

            const rendered = await service.render("xss-link-test");
            expect(rendered?.html).not.toContain("javascript:");
        });

        it("keeps a highlighter's inline token-color styles intact after sanitizing", async () => {
            // Simulates Shiki's real output shape (verified separately
            // against the installed shiki package: codeToHtml() emits
            // per-token `<span style="color:#RRGGBB">`) via the same
            // __setCodeToHtmlForTests() seam every other test in this file
            // uses — a genuine dynamic import("shiki") call can't run
            // under Vitest's VM sandbox (see this describe block's own
            // beforeAll comment), so this proves the sanitizer's style
            // allowlist specifically, not Shiki's rendering.
            __setCodeToHtmlForTests(() =>
                Promise.resolve('<pre class="shiki" style="background-color:#24292e"><code>' +
                    '<span class="line"><span style="color:#F97583">const</span></span></code></pre>')
            );
            try {
                await repo.createDoc({
                    slug: "highlight-style-test",
                    title: "Highlight Style Test",
                    groupTitle: "Testing",
                    sortOrder: 0,
                    content: ["# Highlight Style Test", "", "```typescript", "const x = 1;", "```"].join("\n"),
                });

                const rendered = await service.render("highlight-style-test");
                expect(rendered?.html).toContain("shiki");
                expect(rendered?.html).toMatch(/style="[^"]*color:\s*#F97583/);
            } finally {
                __setCodeToHtmlForTests((code, options) => {
                    const lang = typeof options?.lang === "string" ? options.lang : "text";
                    return Promise.resolve(
                        `<pre class="shiki fake-test-highlighter" data-lang="${lang}"><code>${code}</code></pre>`
                    );
                });
            }
        });

        it("keeps the copy button's icon <svg> tags intact, including viewbox, after sanitizing", async () => {
            // Regression test for a real bug: sanitize-html's underlying
            // htmlparser2 parser lowercases attribute NAMES by default
            // (SVG's real spelling is camelCase "viewBox") before the
            // allowlist check ever runs, so an allowlist entry written as
            // "viewBox" silently never matched the actual (lowercased)
            // "viewbox" key — every code block's copy-icon <svg> lost its
            // viewBox and rendered with no usable coordinate system.
            // wrapCodeBlock() (app/services/docs.service.ts) emits this
            // markup on every fenced code block, so any doc with one
            // exercises it — verified against the real rendered html here,
            // not just that sanitization didn't crash.
            await repo.createDoc({
                slug: "copy-icon-svg-test",
                title: "Copy Icon SVG Test",
                groupTitle: "Testing",
                sortOrder: 0,
                content: ["# Copy Icon SVG Test", "", "```bash", "echo hi", "```"].join("\n"),
            });

            const rendered = await service.render("copy-icon-svg-test");
            expect(rendered?.html).toContain("code-block-copy");
            expect(rendered?.html).toMatch(/<svg[^>]*viewbox="0 0 24 24"/i);
            expect(rendered?.html).toContain("<rect");
            expect(rendered?.html).toContain("<path");
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
