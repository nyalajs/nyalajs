import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as esbuild from "esbuild";
import { IslandManifest } from "./manifest";
import { IslandFileManifest } from "./manifest-cache";

export interface BuildIslandsOptions {
    /** Directory manifest paths are resolved relative to. */
    baseDir: string;
    /** Directory to write `islands/{name}-{hash}.js`, `_nyala-islands-{hash}.js`, and `islands-manifest.json` into (served via FastifyAdapter's staticDir). */
    outDir: string;
    /** Defaults to true when NODE_ENV === "production". */
    minify?: boolean;
    /**
     * Rebuild automatically on source change instead of a one-shot build.
     * The returned promise resolves once the first build completes; call
     * `.dispose()` on the result to stop watching. Intended for `nyala dev`
     * only — `nyala build` always does a single clean pass.
     */
    watch?: boolean;
}

export interface BuildIslandsResult {
    dispose(): Promise<void>;
}

function shortHash(content: string): string {
    return crypto.createHash("sha1").update(content).digest("hex").slice(0, 8);
}

function generateBootstrapScript(islands: Record<string, string>): string {
    return `
const ISLANDS = ${JSON.stringify(islands)};
document.querySelectorAll("[data-nyala-island]").forEach(async (el) => {
    const name = el.getAttribute("data-nyala-island");
    const file = ISLANDS[name];
    if (!file) {
        console.error(\`[nyala] no bundle for island "\${name}" — rebuild with \\\`nyala build\\\`?\`);
        return;
    }
    try {
        const props = JSON.parse(el.getAttribute("data-nyala-props") || "{}");
        const mod = await import(\`/public/islands/\${file}\`);
        await mod.hydrate(el, props);
    } catch (error) {
        console.error(\`[nyala] failed to hydrate island "\${name}":\`, error);
    }
});
`.trimStart();
}

/**
 * Bundles each island in `manifest` into its own content-hashed client
 * entry point (react-dom/client's hydrateRoot, scoped to just that
 * component) and writes islands-manifest.json + a matching hashed bootstrap
 * script. Run via `nyala build`/`nyala dev` whenever app/islands/manifest.ts
 * exists — not called automatically otherwise, so apps with no islands pay
 * zero cost.
 *
 * Content hashes mean a redeploy with changed component code always gets a
 * new filename — no stale-bundle-in-a-browser-cache problem.
 */
export async function buildIslands(
    manifest: IslandManifest,
    options: BuildIslandsOptions
): Promise<BuildIslandsResult | void> {
    const islandsOutDir = path.join(options.outDir, "islands");
    fs.rmSync(islandsOutDir, { recursive: true, force: true });
    fs.mkdirSync(islandsOutDir, { recursive: true });

    const minify = options.minify ?? process.env.NODE_ENV === "production";
    const fileManifest: IslandFileManifest = { islands: {}, bootstrap: "" };

    const flush = () => {
        const bootstrapContent = generateBootstrapScript(fileManifest.islands);
        const bootstrapName = `_nyala-islands-${shortHash(bootstrapContent)}.js`;

        // Remove any previous bootstrap file (its content — and therefore
        // its hash — just changed).
        for (const f of fs.readdirSync(options.outDir)) {
            if (f.startsWith("_nyala-islands-") && f.endsWith(".js") && f !== bootstrapName) {
                fs.unlinkSync(path.join(options.outDir, f));
            }
        }

        fileManifest.bootstrap = bootstrapName;
        fs.writeFileSync(path.join(options.outDir, bootstrapName), bootstrapContent);
        fs.writeFileSync(
            path.join(options.outDir, "islands-manifest.json"),
            JSON.stringify(fileManifest, null, 2)
        );
    };

    const manifestPlugin = (name: string): esbuild.Plugin => ({
        name: "nyala-island-manifest",
        setup(build) {
            build.onEnd((result) => {
                const outputPath = result.metafile && Object.keys(result.metafile.outputs)[0];
                if (outputPath) {
                    fileManifest.islands[name] = path.basename(outputPath);
                    flush();
                }
            });
        },
    });

    const contexts: esbuild.BuildContext[] = [];
    // Real entry files, not esbuild's `stdin` mode — `stdin` doesn't honor
    // `sourcefile` for `entryNames`' `[name]` placeholder (it's always
    // "stdin"), which defeats the point of content-hashed-but-readable
    // filenames. Isolated in their own subfolder (not dumped directly into
    // baseDir) so a name like "Counter" can't collide with a real
    // app/islands/Counter.tsx — this folder is one level under baseDir, so
    // node_modules resolution (react, react-dom/client) still walks up to
    // the exact same place a real file in baseDir would.
    const entriesDir = path.join(options.baseDir, ".nyala-island-entries");
    fs.mkdirSync(entriesDir, { recursive: true });
    const entryFiles: string[] = [];

    // Watch mode keeps rebuilding on file changes, and esbuild's watcher
    // treats the entry point as one of the watched inputs — deleting it
    // right away would break the *next* rebuild. Only clean up entry files
    // immediately for one-shot builds; in watch mode they're removed when
    // dispose() is called instead.
    const cleanupEntryFiles = () => {
        fs.rmSync(entriesDir, { recursive: true, force: true });
    };

    try {
        for (const [name, relativePath] of Object.entries(manifest)) {
            const absPath = path.resolve(options.baseDir, relativePath);
            const entryFile = path.join(entriesDir, `${name}.tsx`);

            fs.writeFileSync(
                entryFile,
                `
                import { hydrateRoot } from "react-dom/client";
                import * as mod from "${absPath.replace(/\\/g, "\\\\")}";
                const Component = mod.default ?? mod["${name}"];
                export function hydrate(container, props) {
                    hydrateRoot(container, <Component {...props} />);
                }
                `.trimStart()
            );
            entryFiles.push(entryFile);

            const buildOptions: esbuild.BuildOptions = {
                entryPoints: [entryFile],
                bundle: true,
                format: "esm",
                platform: "browser",
                target: "es2020",
                minify,
                entryNames: "[name]-[hash]",
                outdir: islandsOutDir,
                metafile: true,
                // The mod.default ?? mod["Name"] fallback is intentionally
                // dead code when the component only has a default export
                // (the common case) — esbuild can't know that ahead of
                // time and warns about it. Correct at runtime; silence
                // the noise.
                logOverride: { "import-is-undefined": "silent" },
                plugins: [manifestPlugin(name)],
            };

            if (options.watch) {
                const ctx = await esbuild.context(buildOptions);
                await ctx.watch();
                contexts.push(ctx);
            } else {
                await esbuild.build(buildOptions);
            }
        }
    } catch (error) {
        cleanupEntryFiles();
        throw error;
    }

    if (options.watch) {
        return {
            dispose: async () => {
                await Promise.all(contexts.map((ctx) => ctx.dispose()));
                cleanupEntryFiles();
            },
        };
    }

    cleanupEntryFiles();
}
