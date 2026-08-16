import { Marked } from "marked";
import type { codeToHtml as CodeToHtml } from "shiki";
import { Injectable } from "@nyalajs/core";
import { DocRepository } from "../repositories/doc.repository";
import { Doc } from "../models/doc.model";

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

export interface RenderedDoc {
    title: string;
    html: string;
    headings: { depth: number; text: string; id: string }[];
}

export interface NavItem {
    slug: string;
    title: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

// Verified against shiki's real bundledLanguages (Object.keys(bundledLanguages)
// from the installed shiki@1.1.7) — "env" is a fence language used across the
// original website/docs/*.md source (this content was seeded from those
// files — see database/seeders/doc.seeder.ts) but isn't a real Shiki grammar
// (same gap VitePress's own build warns about — "The language 'env' is not
// loaded, falling back to 'txt'"), so it's remapped to shiki's real "dotenv"
// grammar instead of passed through. "text"/"txt" are real, but
// intentionally absent from bundledLanguages — they're Shiki's hard-coded
// no-grammar-needed plaintext path, not missing languages (see
// node_modules/shiki/dist/core-unwasm.d.mts).
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
 * Renders real doc content stored in the database (app/models/doc.model.ts)
 * — full CRUD lives on DocRepository/DocsController; this service owns
 * markdown -> HTML rendering (real marked + shiki, same pipeline as
 * before) and the read-side composition (nav grouping, prev/next,
 * search) on top of whatever rows actually exist right now. Unlike the
 * original file-based version, editing a doc through the app is a real
 * database write, not a filesystem write — the whole point of making
 * this "full CRUD."
 */
@Injectable()
export class DocsService {
    private readonly marked: Marked;

    constructor(private readonly docRepository: DocRepository) {
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
                    // in afterward by resolvePlaceholders() below, which
                    // pre-highlights every code block after marked's
                    // synchronous pass, keyed by a placeholder this
                    // function just has to emit verbatim.
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

    /** Renders one real Doc row's markdown content — same pipeline the old file-based render() used. */
    async renderContent(content: string): Promise<{ html: string; headings: RenderedDoc["headings"] }> {
        const rawHtml = await this.marked.parse(content);
        return resolvePlaceholders(rawHtml);
    }

    async findBySlug(slug: string): Promise<Doc | null> {
        return this.docRepository.findBySlug(slug);
    }

    async render(slug: string): Promise<(RenderedDoc & { doc: Doc }) | null> {
        const doc = await this.docRepository.findBySlug(slug);
        if (!doc) return null;

        const { html, headings } = await this.renderContent(doc.content);
        return { title: doc.title, html, headings: headings.filter((h) => h.depth > 1), doc };
    }

    /** Real nav, grouped from whatever docs actually exist right now — not a hardcoded list. */
    async getNav(): Promise<NavGroup[]> {
        const rows = await this.docRepository.findAllOrdered();
        const groups = new Map<string, NavItem[]>();

        for (const row of rows) {
            const items = groups.get(row.groupTitle) ?? [];
            items.push({ slug: row.slug, title: row.title });
            groups.set(row.groupTitle, items);
        }

        return [...groups.entries()].map(([title, items]) => ({ title, items }));
    }

    /** Previous/next links for the bottom-of-article navigation, in real DB order. */
    async getAdjacent(slug: string): Promise<{ prev: NavItem | null; next: NavItem | null }> {
        const rows = await this.docRepository.findAllOrdered();
        const index = rows.findIndex((row) => row.slug === slug);
        if (index === -1) return { prev: null, next: null };
        return {
            prev: index > 0 ? { slug: rows[index - 1].slug, title: rows[index - 1].title } : null,
            next: index < rows.length - 1 ? { slug: rows[index + 1].slug, title: rows[index + 1].title } : null,
        };
    }

    /** Real search over real rows — title/content/group substring match, no separate index to keep in sync. */
    async search(query: string): Promise<{ slug: string; title: string; group: string; excerpt: string }[]> {
        const q = query.trim().toLowerCase();
        if (!q) return [];

        const rows = await this.docRepository.findAllOrdered();
        return rows
            .filter(
                (row) =>
                    row.title.toLowerCase().includes(q) ||
                    row.content.toLowerCase().includes(q) ||
                    row.groupTitle.toLowerCase().includes(q)
            )
            .slice(0, 20)
            .map((row) => ({
                slug: row.slug,
                title: row.title,
                group: row.groupTitle,
                excerpt: firstParagraph(row.content),
            }));
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

async function resolvePlaceholders(html: string): Promise<{ html: string; headings: RenderedDoc["headings"] }> {
    const headings: RenderedDoc["headings"] = [];
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

function firstParagraph(markdown: string): string {
    const withoutFrontmatter = markdown.replace(/^---[\s\S]*?---\n/, "");
    const withoutHeading = withoutFrontmatter.replace(/^#.*\n+/, "");
    const firstBlock = withoutHeading.split(/\n\s*\n/).find((block) => block.trim() && !block.trim().startsWith("#"));
    return (firstBlock ?? "").replace(/\n/g, " ").replace(/[*_`]/g, "").trim().slice(0, 160);
}
