import { InertiaPage } from "./types";
import { AssetVersionResolver } from "./asset-version";

export interface RootHtmlOptions {
    /** <title> content. Defaults to "Nyala". */
    title?: string;
    /**
     * Element id for the Inertia root div, and the id createInertiaApp()
     * looks the data-page attribute up on. Defaults to "app" — matches
     * @inertiajs/react's own default (verified in its compiled
     * createInertiaApp, `id = "app"`), so an app that doesn't customize
     * either side never has to think about this.
     */
    rootId?: string;
    /**
     * Path (relative to the app root) of the client entry module — the
     * file that calls createInertiaApp(). e.g. "app/main.tsx".
     */
    entry: string;
    /** Resolves dev-vs-prod asset locations. */
    assets: AssetVersionResolver;
    /**
     * Vite dev server origin (e.g. "http://localhost:5173"), used only
     * when assets are in dev mode. Defaults to "http://localhost:5173".
     */
    viteDevServerUrl?: string;
    /**
     * URL prefix built assets are served under in production — must match
     * both Vite's `build.outDir` (relative to the app root) and whatever
     * FastifyAdapter's `staticPrefix`/`staticDir` options serve that
     * directory under. Defaults to "/build/" (trailing slash required).
     */
    assetBaseUrl?: string;
    /** Extra <head> HTML (fonts, meta tags, ...) inserted verbatim before </head>. */
    head?: string;
    /**
     * Server-rendered markup from a running app/ssr.tsx process (see
     * ssr/index.ts's renderViaSsrServer()). When present, the root div is
     * pre-populated with this markup (like ReactDOMServer.renderToString
     * output for any other SSR setup) instead of being left empty for
     * client hydration to fill in from scratch, and `head.head` entries
     * (e.g. from <Head> usage in page components) are spliced into <head>.
     * Omitted entirely by default — SSR is opt-in, per this package's
     * ssr/index.ts doc comment.
     */
    ssr?: { head: string[]; body: string } | null;
}

const DEFAULT_VITE_DEV_URL = "http://localhost:5173";

/**
 * Escapes a JSON string for safe embedding inside an HTML attribute. `<` is
 * escaped so a prop value containing "</script>"-like text can never break
 * out of the page — matters because prop values are arbitrary
 * controller-supplied data (user content, DB rows), not developer-authored
 * markup.
 */
function escapeForHtmlAttribute(json: string): string {
    return json.replace(/</g, "\\u003c").replace(/"/g, "&quot;");
}

/**
 * Renders the root `<!DOCTYPE html>` shell for a non-Inertia request (first
 * load / hard navigation). Produces a div#app with a data-page attribute
 * holding the serialized initial Page object — verified against
 * @inertiajs/react@2.3.27's createInertiaApp, which reads exactly this
 * convention client-side (getInitialPageFromDOM: reads el.dataset.page,
 * JSON.parse()s it).
 *
 * Script tags differ between dev and prod, mirroring every other
 * Vite-backend integration (Laravel's @vite() Blade directive, etc.): in
 * dev the shell points AT the Vite dev server directly (not proxied
 * through the backend) so Vite's client owns HMR; in prod it reads the
 * built, hashed asset paths out of Vite's manifest.json.
 */
export function renderRootHtml(page: InertiaPage, options: RootHtmlOptions): string {
    const rootId = options.rootId ?? "app";
    const title = options.title ?? "Nyala";
    const dataPage = escapeForHtmlAttribute(JSON.stringify(page));

    const scripts = options.assets.isDev() ? devScripts(options) : prodScripts(options);
    const ssrHead = (options.ssr?.head ?? []).join("\n    ");
    const rootMarkup = options.ssr?.body ?? "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    ${options.head ?? ""}
    ${ssrHead}
    ${scripts.head}
</head>
<body>
    <div id="${rootId}" data-page="${dataPage}">${rootMarkup}</div>
    ${scripts.body}
</body>
</html>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function devScripts(options: RootHtmlOptions): { head: string; body: string } {
    const viteUrl = (options.viteDevServerUrl ?? DEFAULT_VITE_DEV_URL).replace(/\/$/, "");
    // React Fast Refresh requires this preamble script to run before the
    // React plugin's injected client code — @vitejs/plugin-react's own
    // docs specify this exact snippet for non-Vite-templated HTML shells.
    const reactRefreshPreamble = `<script type="module">
        import RefreshRuntime from "${viteUrl}/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
    </script>`;

    return {
        head: `${reactRefreshPreamble}
    <script type="module" src="${viteUrl}/@vite/client"></script>`,
        body: `<script type="module" src="${viteUrl}/${options.entry}"></script>`,
    };
}

function prodScripts(options: RootHtmlOptions): { head: string; body: string } {
    const chunk = options.assets.resolveEntry(options.entry);
    const base = options.assetBaseUrl ?? "/build/";

    const cssLinks = (chunk.css ?? [])
        .map((href) => `<link rel="stylesheet" href="${base}${href}" />`)
        .join("\n    ");

    return {
        head: cssLinks,
        body: `<script type="module" src="${base}${chunk.file}"></script>`,
    };
}
