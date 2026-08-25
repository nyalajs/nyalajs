import * as path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Frontend build config. `nyala dev` runs a real Vite dev server
 * (packages/cli/src/commands/vite-dev.command.ts) pointed at this file;
 * `nyala build` runs `vite build` (vite-build.command.ts) to produce
 * build.outDir's manifest.json + hashed assets, which
 * @nyalajs/inertia's AssetVersionResolver (packages/inertia/src/asset-version.ts)
 * reads at runtime — its outDir must match config/inertia.ts's
 * `buildOutDir` exactly.
 */
export default defineConfig(({ command }) => ({
    plugins: [react()],
    root: __dirname,
    // Only for `vite build` — matches config/inertia.ts's assetBaseUrl
    // ("/build/"), which is also what html-shell.ts's prodScripts()
    // prepends to the entry script/CSS <link> tags it renders by hand.
    // Vite's OWN internal dynamic-import machinery (the __vitePreload
    // helper wrapping every route-level import.meta.glob() chunk — see
    // resources/js/pages/**/*.tsx) doesn't read assetBaseUrl at all;
    // without this it hardcodes `"/" + assetPath` (Vite's default base is
    // "/"), so every lazy-loaded page chunk 404s at /assets/Foo-....js
    // instead of /build/assets/Foo-....js once there's more than one
    // route chunk to lazy-load into (confirmed against the same bug, live,
    // in examples/docs-site — the entry script itself loads fine since
    // its <script src> is built by hand from assetBaseUrl, but navigating
    // to any route needing a dynamic import 404s). `command === "serve"`
    // (`vite dev`) must NOT set this — the dev server serves everything
    // from its own root, unprefixed.
    base: command === "build" ? "/build/" : "/",
    // Matches components.json's aliases + tsconfig.frontend.json's "@/*"
    // path mapping — shadcn/ui's generated imports (`@/components/ui/button`,
    // `@/lib/utils`) resolve the same way at both typecheck and build time.
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./resources/js"),
        },
    },
    // No static assets to copy verbatim, and Vite's default publicDir
    // ("public/") would otherwise sit one level above build.outDir
    // ("public/build") and warn about the overlap on every build.
    publicDir: false,
    build: {
        // Matches config/inertia.ts's buildOutDir default ("public/build")
        // and bootstrap/main.ts's FastifyAdapter staticDir/staticPrefix
        // wiring, so hashed assets land where the backend actually serves
        // them from in production.
        outDir: "public/build",
        manifest: true,
        rollupOptions: {
            input: "resources/js/app.tsx",
        },
        emptyOutDir: true,
        commonjsOptions: {
            // @nyalajs/inertia (and any other @nyalajs/* workspace package
            // imported client-side) is CommonJS output (tsc's default,
            // matching every other package in this monorepo — see
            // packages/inertia/tsconfig.json) but lives at
            // node_modules/@nyalajs/inertia as a symlink INTO packages/inertia,
            // not physically inside node_modules/. Vite's commonjs plugin
            // only transforms paths matching /node_modules/ by default
            // (real-path resolved, so symlinked-out workspace packages are
            // silently skipped), which makes Rollup parse this package's
            // `exports.x = ...`/Object.defineProperty CJS output as if it
            // were ESM with zero named exports — "X is not exported by
            // .../dist/client/index.js". Extending the include pattern to
            // match @nyalajs/* by content (not just real path) fixes it.
            include: [/node_modules/, /packages\/[^/]+\/dist/],
        },
    },
    server: {
        // Not proxied through Fastify — html-shell.ts's dev-mode <script>
        // tags point straight at this dev server's origin (see
        // docs/inertia-starter-spec.md §4/Open Question #2's resolution).
        strictPort: true,
    },
    optimizeDeps: {
        // Same root cause as build.commonjsOptions.include above, but for
        // `vite dev`'s esbuild-based pre-bundler instead of `vite build`'s
        // Rollup: it only scans real node_modules/ contents by default, so
        // @nyalajs/inertia (symlinked in from packages/inertia within this
        // monorepo's own workspaces, CJS output) is never pre-bundled into
        // ESM. The browser then loads its raw `exports.createInertiaApp =
        // ...` CJS straight off disk via `/@fs/...`, where native ESM
        // `import { createInertiaApp }` can't see it — "does not provide an
        // export named 'createInertiaApp'". Listing it explicitly forces
        // esbuild to pre-bundle (and CJS-interop) it like any other
        // dependency. Harmless once this template is scaffolded out via
        // `nyala new` into its own project, where @nyalajs/inertia is a
        // normal published package physically inside node_modules/ and
        // Vite's default scanning already covers it.
        include: ["@nyalajs/inertia/client"],
    },
}));
