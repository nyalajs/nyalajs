import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { renderRootHtml } from "../html-shell";
import { AssetVersionResolver } from "../asset-version";
import { InertiaPage } from "../types";

function samplePage(overrides: Partial<InertiaPage> = {}): InertiaPage {
    return {
        component: "Home",
        props: { errors: {} },
        url: "/",
        version: "v1",
        clearHistory: false,
        encryptHistory: false,
        ...overrides,
    };
}

describe("renderRootHtml — dev mode", () => {
    it("points the client script at the Vite dev server, not a local/proxied path", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            viteDevServerUrl: "http://localhost:5173",
        });

        expect(html).toContain('src="http://localhost:5173/@vite/client"');
        expect(html).toContain('src="http://localhost:5173/app/main.tsx"');
    });

    it("includes the React Fast Refresh preamble required by @vitejs/plugin-react", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
        });

        expect(html).toContain("@react-refresh");
        expect(html).toContain("RefreshRuntime.injectIntoGlobalHook");
    });

    it("defaults the Vite dev server URL to http://localhost:5173", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
        });

        expect(html).toContain("http://localhost:5173/@vite/client");
    });
});

describe("renderRootHtml — production mode", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nyala-inertia-shell-"));
        await fs.promises.mkdir(path.join(tmpDir, ".vite"), { recursive: true });
        await fs.promises.writeFile(
            path.join(tmpDir, ".vite/manifest.json"),
            JSON.stringify({
                "app/main.tsx": {
                    file: "assets/main-abc123.js",
                    css: ["assets/main-def456.css"],
                    isEntry: true,
                },
            })
        );
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    it("references the hashed built asset path from the manifest, not the raw entry path", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: tmpDir, dev: false }),
        });

        expect(html).toContain('src="/build/assets/main-abc123.js"');
        expect(html).not.toContain("@vite/client");
    });

    it("includes a <link> for each CSS file the manifest chunk lists", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: tmpDir, dev: false }),
        });

        expect(html).toContain('href="/build/assets/main-def456.css"');
    });

    it("respects a custom assetBaseUrl", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: tmpDir, dev: false }),
            assetBaseUrl: "/static/",
        });

        expect(html).toContain('src="/static/assets/main-abc123.js"');
    });

    it("throws (bubbling up from resolveEntry) when the entry isn't in the manifest", () => {
        expect(() =>
            renderRootHtml(samplePage(), {
                entry: "app/missing.tsx",
                assets: new AssetVersionResolver({ outDir: tmpDir, dev: false }),
            })
        ).toThrow(/no entry for/);
    });
});

describe("renderRootHtml — data-page attribute", () => {
    it("uses 'app' as the default root element id, matching @inertiajs/react's own default", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
        });

        expect(html).toMatch(/<div id="app" data-page="/);
    });

    it("honors a custom rootId", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            rootId: "custom-root",
        });

        expect(html).toContain('<div id="custom-root" data-page="');
    });

    it("round-trips the full Page object through the data-page attribute", () => {
        const page = samplePage({ props: { errors: {}, greeting: "hello" }, url: "/dashboard" });
        const html = renderRootHtml(page, {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
        });

        const match = html.match(/data-page="([^"]*)"/);
        const decoded = match![1].replace(/&quot;/g, '"');
        expect(JSON.parse(decoded)).toEqual(page);
    });

    it("escapes '<' in prop values so they can't break out of the attribute/inject a script tag", () => {
        const page = samplePage({ props: { errors: {}, bio: "</script><script>alert(1)</script>" } });
        const html = renderRootHtml(page, {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
        });

        expect(html).not.toContain("</script><script>alert(1)</script>");
    });
});

describe("renderRootHtml — SSR splicing (opt-in)", () => {
    it("leaves the root div empty when no ssr result is provided (default CSR behavior)", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
        });

        expect(html).toMatch(/<div id="app" data-page="[^"]*"><\/div>/);
    });

    it("pre-populates the root div with SSR-rendered markup when provided", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            ssr: { head: [], body: "<h1>Server rendered</h1>" },
        });

        expect(html).toContain("<h1>Server rendered</h1>");
    });

    it("splices ssr.head entries into <head>", () => {
        const html = renderRootHtml(samplePage(), {
            entry: "app/main.tsx",
            assets: new AssetVersionResolver({ outDir: "/nonexistent", dev: true }),
            ssr: { head: ["<title>SSR Title</title>"], body: "" },
        });

        expect(html).toContain("<title>SSR Title</title>");
    });
});
