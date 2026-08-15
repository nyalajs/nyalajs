import { InertiaPage } from "../types";

/**
 * SSR is opt-in and OFF by default (per docs/inertia-starter-spec.md's
 * resolved Open Question #3) — the default `nyala dev`/`nyala build`/
 * `nyala start` never start or call this. An app that wants SSR:
 *
 *   1. Adds a `resources/js/ssr.tsx` entry that calls @inertiajs/react/server's
 *      createInertiaApp() with a `render` (renderToString) option — see
 *      the exact shape in @inertiajs/react's types/createInertiaApp.d.ts
 *      (InertiaAppOptionsForSSR), confirmed against the real installed
 *      package.
 *   2. Builds that entry separately (`nyala build --ssr`, or
 *      `vite build --ssr resources/js/ssr.tsx --outDir dist/ssr`) and runs
 *      it as a long-lived Node process: `node dist/ssr/ssr.js`. That process
 *      uses @inertiajs/core/server's default export, which starts a tiny
 *      HTTP server (default port 13714) with one route worth knowing about:
 *      `POST /render` — body is the JSON-encoded Page object, response is
 *      `{ head: string[], body: string }`.
 *   3. The Nyala backend calls renderViaSsrServer() (below) instead of
 *      html-shell.ts's client-side hydration markup when SSR is enabled,
 *      splicing the returned `head`/`body` into the HTML shell.
 *
 * Example resources/js/ssr.tsx:
 *
 *   import { createInertiaApp } from "@inertiajs/react/server";
 *   import createServer from "@inertiajs/core/server";
 *   import ReactDOMServer from "react-dom/server";
 *   import { resolvePageComponent } from "@nyalajs/inertia/client";
 *
 *   createServer((page) =>
 *     createInertiaApp({
 *       page,
 *       render: ReactDOMServer.renderToString,
 *       resolve: (name) =>
 *         resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob("./pages/**\/*.tsx")),
 *       setup: ({ App, props }) => <App {...props} />,
 *     })
 *   );
 */
export interface SsrRenderResult {
    head: string[];
    body: string;
}

export interface SsrClientOptions {
    /** Base URL of the running SSR server, e.g. "http://127.0.0.1:13714". */
    url?: string;
    /** Abort the SSR call and fall back to CSR if it takes longer than this. Defaults to 5000ms. */
    timeoutMs?: number;
}

const DEFAULT_SSR_URL = "http://127.0.0.1:13714";

/**
 * Calls a running `resources/js/ssr.tsx` process's /render endpoint (started
 * separately — see this module's doc comment) to server-render a page.
 * Returns null on any failure (SSR server not running, timeout, ...) so
 * callers can fall back to plain CSR rather than 500ing the whole request
 * — SSR is a progressive enhancement here, not a hard requirement.
 */
export async function renderViaSsrServer(page: InertiaPage, options: SsrClientOptions = {}): Promise<SsrRenderResult | null> {
    const url = (options.url ?? process.env.NYALA_SSR_URL ?? DEFAULT_SSR_URL).replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

    try {
        const response = await fetch(`${url}/render`, {
            method: "POST",
            body: JSON.stringify(page),
            signal: controller.signal,
        });

        if (!response.ok) return null;
        return (await response.json()) as SsrRenderResult;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
