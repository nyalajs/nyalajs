import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { ConfigService } from "@nyalajs/config";
import { DocsService, __setCodeToHtmlForTests } from "../../app/services/docs.service";

/**
 * Runs against a real temp directory of real .md files — not mocked reads
 * — since DocsService's whole job is reading real files off disk and
 * running them through real marked. Mocking fs here would just be testing
 * that the mocks return what they were told to return.
 *
 * shiki itself is swapped for a lightweight real function via
 * __setCodeToHtmlForTests(), not mocked away entirely — Vitest's module
 * runner can't execute the app's real dynamic import("shiki") (throws
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING; confirmed this is a vite-node VM
 * sandbox limitation, not a bug — the same code runs correctly under plain
 * Node). What's actually under test here is DocsService's own logic
 * (placeholder substitution, language aliasing, heading dedup, link
 * rewriting), not Shiki's rendering — real end-to-end Shiki output
 * (including the env→dotenv fix) was verified by running the compiled
 * server and rendering every real website/docs/*.md file; see this app's
 * README for that verification.
 */
describe("DocsService", () => {
    let tmpDir: string;
    let service: DocsService;

    beforeAll(async () => {
        __setCodeToHtmlForTests((code, options) => {
            const lang = typeof options?.lang === "string" ? options.lang : "text";
            return Promise.resolve(
                `<pre class="shiki fake-test-highlighter" data-lang="${lang}"><code>${code}</code></pre>`
            );
        });

        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-docs-test-"));

        await fs.writeFile(
            path.join(tmpDir, "introduction.md"),
            [
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
            ].join("\n")
        );

        await fs.writeFile(
            path.join(tmpDir, "installation.md"),
            ["# Installation", "", "Install steps.", "", "```env", "SESSION_SECRET=change-me", "```"].join("\n")
        );

        const config = new ConfigService();
        config.load("docs", { sourceDir: tmpDir });
        service = new DocsService(config);
    });

    afterAll(async () => {
        __setCodeToHtmlForTests(null);
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    describe("exists", () => {
        it("returns true for a real file", async () => {
            expect(await service.exists("introduction")).toBe(true);
        });

        it("returns false for a slug with no matching file", async () => {
            expect(await service.exists("does-not-exist")).toBe(false);
        });

        it("returns false rather than throwing for a path-traversal attempt", async () => {
            expect(await service.exists("../../../etc/passwd")).toBe(false);
        });
    });

    describe("render", () => {
        it("extracts the title from the real H1", async () => {
            const page = await service.render("introduction");
            expect(page.title).toBe("Introduction");
        });

        it("renders real markdown to real HTML", async () => {
            const page = await service.render("introduction");
            expect(page.html).toContain("<h1");
            expect(page.html).toContain("This is the real first paragraph");
        });

        it("routes fenced code blocks through the highlighter with the right language", async () => {
            const page = await service.render("introduction");
            expect(page.html).toContain('data-lang="bash"');
            expect(page.html).toContain("npm install");
        });

        it("remaps the env fence language to shiki's real dotenv grammar instead of passing 'env' through", async () => {
            // Regression test for a real bug: shiki has no "env" grammar
            // (confirmed against its bundledLanguages), and
            // website/docs/*.md fences plenty of code blocks as ```env —
            // rendering one used to throw ShikiError before the
            // LANG_ALIASES fix. Asserting on data-lang (not just that
            // rendering succeeded) proves the alias actually reaches
            // codeToHtml's options, not just that some fallback silently
            // avoided the error.
            const page = await service.render("installation");
            expect(page.html).toContain('data-lang="dotenv"');
            expect(page.html).not.toContain('data-lang="env"');
            expect(page.html).toContain("SESSION_SECRET");
        });

        it("excludes the H1 from the returned headings list", async () => {
            const page = await service.render("introduction");
            expect(page.headings.every((h) => h.depth > 1)).toBe(true);
        });

        it("de-duplicates heading ids for repeated heading text", async () => {
            const page = await service.render("introduction");
            const ids = page.headings.map((h) => h.id);
            expect(ids).toContain("installation");
            expect(ids).toContain("installation-1");
            expect(new Set(ids).size).toBe(ids.length);
        });

        it("rewrites a relative markdown link to a /docs/:slug route", async () => {
            const page = await service.render("introduction");
            expect(page.html).toContain('href="/docs/installation"');
        });

        it("rejects a path-traversal slug instead of reading outside sourceDir", async () => {
            await expect(service.render("../../../etc/passwd")).rejects.toThrow();
        });
    });

    describe("getAdjacent", () => {
        it("returns null prev for the first real nav item", () => {
            const { prev } = service.getAdjacent("introduction");
            expect(prev).toBeNull();
        });

        it("returns null for both when the slug isn't in nav at all", () => {
            const { prev, next } = service.getAdjacent("not-in-nav");
            expect(prev).toBeNull();
            expect(next).toBeNull();
        });
    });

    describe("getSearchIndex", () => {
        it("builds real excerpts from each file's first real paragraph", async () => {
            const index = await service.getSearchIndex();
            const intro = index.find((entry) => entry.slug === "introduction");
            expect(intro?.excerpt).toContain("real first paragraph");
        });

        it("skips a nav slug whose file is missing instead of throwing", async () => {
            const index = await service.getSearchIndex();
            expect(Array.isArray(index)).toBe(true);
        });
    });
});
