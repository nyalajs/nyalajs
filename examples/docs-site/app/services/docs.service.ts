import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";
import { Marked } from "marked";
import type { codeToHtml as CodeToHtml } from "shiki";
import { Injectable } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { docsNav, flatNavItems, type NavItem } from "../docs/nav";

/**
 * shiki is ESM-only; this package compiles to CommonJS (tsc's default,
 * same as every other package/app in this monorepo), so a static `import`
 * here would force Node's experimental require()-of-ESM interop at
 * runtime (verified: it emits an ExperimentalWarning on every boot).
 * Loading it via a real dynamic import() instead is the standard, stable
 * way to consume an ESM-only dependency from CJS — cached after the first
 * call since the module itself never changes across requests.
 */
// A plain `import("shiki")` here gets compiled by tsc (module: commonjs)
// into `Promise.resolve().then(() => require("shiki"))` — still a
// synchronous require() under the hood, which hits the exact same
// ExperimentalWarning this is meant to avoid (verified: checked the
// compiled dist/ output). Routing it through `new Function` prevents tsc
// from rewriting it, forcing a genuine dynamic import() at runtime — the
// standard workaround for consuming an ESM-only package from a CJS build.
const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
) => Promise<typeof import("shiki")>;

let codeToHtmlPromise: Promise<typeof CodeToHtml> | null = null;
let codeToHtmlOverride: typeof CodeToHtml | null = null;

function loadCodeToHtml(): Promise<typeof CodeToHtml> {
    if (codeToHtmlOverride) return Promise.resolve(codeToHtmlOverride);
    if (!codeToHtmlPromise) {
        codeToHtmlPromise = dynamicImport("shiki").then((mod) => mod.codeToHtml);
    }
    return codeToHtmlPromise;
}

/**
 * Test-only seam: Vitest's module runner executes app code inside a VM
 * context that throws ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING on a bare
 * dynamic import() (verified — this is a real vite-node/Vitest limitation,
 * not specific to this package; the same import() works correctly under
 * plain Node, confirmed by actually running the compiled server). Tests
 * that need to exercise code-highlighting behavior call this to swap in a
 * fake implementation instead of fighting that sandbox.
 */
export function __setCodeToHtmlForTests(fn: typeof CodeToHtml | null): void {
    codeToHtmlOverride = fn;
}

export interface DocPage {
    title: string;
    html: string;
    headings: { depth: number; text: string; id: string }[];
}

export interface DocSearchEntry {
    slug: string;
    title: string;
    group: string;
    excerpt: string;
}

// Verified against shiki's real bundledLanguages (Object.keys(bundledLanguages)
// from the installed shiki@1.1.7) — "env" is used as a fence language across
// website/docs/*.md but isn't a real Shiki grammar (same gap VitePress's own
// build warns about — "The language 'env' is not loaded, falling back to
// 'txt'"), so it's remapped to shiki's real "dotenv" grammar instead of
// passed through. "text"/"txt" are real, but intentionally absent from
// bundledLanguages — they're Shiki's hard-coded no-grammar-needed plaintext
// path, not missing languages (see node_modules/shiki/dist/core-unwasm.d.mts).
const LANG_ALIASES: Record<string, string> = {
    env: "dotenv",
};

const SUPPORTED_LANGS = new Set([
    "typescript",
    "ts",
    "tsx",
    "javascript",
    "js",
    "jsx",
    "bash",
    "sh",
    "shell",
    "json",
    "yaml",
    "yml",
    "sql",
    "dotenv",
    "dockerfile",
    "html",
    "css",
    "diff",
    "text",
    "txt",
]);

/**
 * Reads and renders the real website/docs/*.md files at request time — no
 * static build step, no separate copy of the content. This is what makes
 * the docs app "dynamic": editing a file under website/docs/ and reloading
 * the page shows the change immediately, same as any other Nyala
 * controller reading from a real data source.
 */
@Injectable()
export class DocsService {
    private readonly marked: Marked;

    constructor(private readonly config: ConfigService) {
        this.marked = new Marked();
        this.marked.use({
            renderer: {
                // marked@12's RendererObject is derived from Renderer's
                // real (positional-argument, synchronous) methods — no
                // token object is passed to code()/heading()/link() here,
                // just plain strings. Verified against
                // node_modules/marked/lib/marked.d.ts's _Renderer class
                // rather than assumed from a newer marked version's API.
                code(code, infostring) {
                    // Shiki's highlighter is async, but this renderer call
                    // is not — real syntax-highlighted HTML is substituted
                    // in afterward by renderMarkdown() below, which
                    // pre-highlights every code block before marked ever
                    // parses the document, keyed by a sentinel placeholder
                    // this function just has to emit verbatim.
                    return codeBlockPlaceholder(code, infostring ?? "");
                },
                heading(text, level, raw) {
                    return headingPlaceholder(text, level, raw);
                },
                link(href, title, text) {
                    if (!href || /^(https?:)?\/\//.test(href) || href.startsWith("#")) {
                        const titleAttr = title ? ` title="${title}"` : "";
                        const external = /^https?:\/\//.test(href ?? "") ? ' target="_blank" rel="noreferrer"' : "";
                        return `<a href="${href}"${titleAttr}${external}>${text}</a>`;
                    }
                    const titleAttr = title ? ` title="${title}"` : "";
                    return `<a href="${rewriteDocLink(href)}"${titleAttr}>${text}</a>`;
                },
            },
        });
    }

    private get sourceDir(): string {
        return this.config.get<string>("docs.sourceDir");
    }

    private resolveFile(slug: string): string {
        // Reject traversal outside sourceDir — slug is attacker-controlled
        // (it's a URL param, see docs.controller.ts), not just internal nav
        // data, so this has to be a real boundary check, not a convenience
        // one.
        const resolved = path.resolve(this.sourceDir, `${slug}.md`);
        if (!resolved.startsWith(this.sourceDir + path.sep) && resolved !== this.sourceDir) {
            throw new Error("Invalid doc path");
        }
        return resolved;
    }

    async exists(slug: string): Promise<boolean> {
        try {
            return existsSync(this.resolveFile(slug));
        } catch {
            return false;
        }
    }

    async render(slug: string): Promise<DocPage> {
        const filePath = this.resolveFile(slug);
        const raw = await fs.readFile(filePath, "utf-8");

        // marked's own code()/heading() renderer methods are synchronous
        // and only receive plain strings (see the constructor's comment),
        // so real async Shiki highlighting and heading-id assignment both
        // happen here as a post-process pass over marked's output: every
        // code()/heading() call above emits a unique HTML-comment
        // placeholder instead of real markup, and this function resolves
        // each placeholder to its real content afterward.
        const rawHtml = await this.marked.parse(raw);
        const { html, headings } = await resolvePlaceholders(rawHtml);

        const h1 = headings.find((h) => h.depth === 1);
        const title = h1?.text ?? titleFromSlug(slug);

        return { title, html, headings: headings.filter((h) => h.depth > 1) };
    }

    getNav() {
        return docsNav;
    }

    /**
     * Previous/next links for the bottom-of-article navigation, in real
     * nav order — matches the "Next Steps" style already used throughout
     * website/docs/*.md, but generated from the actual nav table instead
     * of each file's own hand-written links (which point at specific
     * related pages, not strictly prev/next).
     */
    getAdjacent(slug: string): { prev: NavItem | null; next: NavItem | null } {
        const index = flatNavItems.findIndex((item) => item.slug === slug);
        if (index === -1) return { prev: null, next: null };
        return {
            prev: index > 0 ? flatNavItems[index - 1] : null,
            next: index < flatNavItems.length - 1 ? flatNavItems[index + 1] : null,
        };
    }

    /**
     * Builds the client-side search index — real titles/excerpts pulled
     * from each real file's first paragraph, not placeholder text. Cached
     * per-process since the doc set doesn't change while the server is
     * running; a real edit + restart (or a future file-watcher) picks up
     * changes, same tradeoff as any in-memory cache.
     */
    private searchIndexCache: DocSearchEntry[] | null = null;

    async getSearchIndex(): Promise<DocSearchEntry[]> {
        if (this.searchIndexCache) return this.searchIndexCache;

        const entries: DocSearchEntry[] = [];
        for (const group of docsNav) {
            for (const item of group.items) {
                try {
                    const raw = await fs.readFile(this.resolveFile(item.slug), "utf-8");
                    entries.push({
                        slug: item.slug,
                        title: item.title,
                        group: group.title,
                        excerpt: firstParagraph(raw),
                    });
                } catch {
                    // Skip a slug whose file went missing rather than failing the whole index.
                }
            }
        }

        this.searchIndexCache = entries;
        return entries;
    }
}

// --- Placeholder plumbing for async work inside marked's sync renderer ---
//
// marked@12's RendererObject methods are synchronous and only receive
// plain strings, not token objects (verified against the real installed
// .d.ts — see DocsService's constructor comment). Shiki highlighting and
// duplicate-safe heading-id assignment both need either async work or
// document-wide state (a running count of how many times a given heading
// text has appeared), neither of which fits inside a single synchronous
// per-token call. So the renderer emits an HTML-comment placeholder
// carrying just enough info (base64-encoded) to resolve for real in a
// single pass over the whole rendered string afterward.

const CODE_PLACEHOLDER = /<!--nyala-code:([A-Za-z0-9+/=]+)-->/g;
const HEADING_PLACEHOLDER = /<!--nyala-heading:([A-Za-z0-9+/=]+)-->/g;

function codeBlockPlaceholder(code: string, infostring: string): string {
    const lang = infostring.trim().split(/\s+/)[0] || "text";
    const payload = Buffer.from(JSON.stringify({ code, lang })).toString("base64");
    return `<!--nyala-code:${payload}-->`;
}

function headingPlaceholder(text: string, level: number, raw: string): string {
    const payload = Buffer.from(JSON.stringify({ text, level, raw })).toString("base64");
    return `<!--nyala-heading:${payload}-->`;
}

async function resolvePlaceholders(
    html: string
): Promise<{ html: string; headings: DocPage["headings"] }> {
    const headings: DocPage["headings"] = [];
    const seenIds = new Map<string, number>();

    let resolved = html;

    const codeMatches = [...html.matchAll(CODE_PLACEHOLDER)];
    if (codeMatches.length > 0) {
        const codeToHtml = await loadCodeToHtml();
        for (const match of codeMatches) {
            const { code, lang: rawLang } = JSON.parse(Buffer.from(match[1], "base64").toString("utf-8"));
            const lang = LANG_ALIASES[rawLang] ?? rawLang;
            const highlighted = await codeToHtml(code, {
                lang: SUPPORTED_LANGS.has(lang) ? lang : "text",
                theme: "github-dark",
            });
            resolved = resolved.replace(match[0], highlighted);
        }
    }

    const headingMatches = [...html.matchAll(HEADING_PLACEHOLDER)];
    for (const match of headingMatches) {
        const { text, level, raw } = JSON.parse(Buffer.from(match[1], "base64").toString("utf-8"));
        const plainText = String(raw).replace(/<[^>]+>/g, "") || text;
        let id = slugify(plainText);
        const count = seenIds.get(id) ?? 0;
        seenIds.set(id, count + 1);
        if (count > 0) id = `${id}-${count}`;
        headings.push({ depth: level, text: plainText, id });
        resolved = resolved.replace(match[0], `<h${level} id="${id}">${text}</h${level}>`);
    }

    return { html: resolved, headings };
}

function rewriteDocLink(href: string): string {
    const [pathPart, hash] = href.split("#");
    const withoutExt = pathPart.replace(/\.md$/, "");
    const normalized = withoutExt.replace(/^\.\//, "");
    return `/docs/${normalized}${hash ? `#${hash}` : ""}`;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
}

function titleFromSlug(slug: string): string {
    const last = slug.split("/").pop() ?? slug;
    return last
        .split("-")
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ");
}

function firstParagraph(markdown: string): string {
    const withoutFrontmatter = markdown.replace(/^---[\s\S]*?---\n/, "");
    const withoutHeading = withoutFrontmatter.replace(/^#.*\n+/, "");
    const firstBlock = withoutHeading.split(/\n\s*\n/).find((block) => block.trim() && !block.trim().startsWith("#"));
    return (firstBlock ?? "").replace(/\n/g, " ").replace(/[*_`]/g, "").trim().slice(0, 160);
}
