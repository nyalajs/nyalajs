import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { docsNav, flatNavItems } from "../../app/docs/nav";

/**
 * Real regression test for a real class of bug: nav.ts's slugs are
 * hand-written data (see its own doc comment for why — it mirrors
 * website/docs/.vitepress/config.ts's sidebar rather than importing it
 * directly), so a slug typo or a renamed/deleted doc file would silently
 * 404 in the app without this check. Runs against the real
 * website/docs/*.md tree, not a fixture.
 */
describe("docsNav", () => {
    const docsRoot = path.resolve(__dirname, "../../../../website/docs");

    it("finds the real website/docs directory", () => {
        expect(fs.existsSync(docsRoot)).toBe(true);
    });

    it("every nav slug has a real .md file behind it", () => {
        const missing = flatNavItems
            .map((item) => item.slug)
            .filter((slug) => !fs.existsSync(path.join(docsRoot, `${slug}.md`)));

        expect(missing).toEqual([]);
    });

    it("has no duplicate slugs across groups", () => {
        const slugs = flatNavItems.map((item) => item.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("every group has at least one item", () => {
        for (const group of docsNav) {
            expect(group.items.length).toBeGreaterThan(0);
        }
    });
});
