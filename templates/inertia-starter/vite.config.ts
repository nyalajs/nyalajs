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
export default defineConfig({
    plugins: [react()],
    root: __dirname,
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
});
