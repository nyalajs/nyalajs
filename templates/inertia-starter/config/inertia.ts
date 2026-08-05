/**
 * Inertia Configuration
 *
 * Wired into @nyalajs/inertia's configureInertia() from bootstrap/main.ts.
 * See docs/inertia-starter-spec.md §2/§4 for the dev-vs-prod asset
 * resolution this backs.
 */

export default {
    // Path (relative to the app root) of the client entry that calls
    // createInertiaApp() — see app/main.tsx.
    entry: "app/main.tsx",
    // Where `vite build` writes dist/.vite/manifest.json + hashed assets
    // (matches vite.config.ts's build.outDir).
    buildOutDir: process.env.VITE_BUILD_OUT_DIR || "public/build",
    // URL prefix those built assets are served under — matches
    // vite.config.ts's `base` and how bootstrap/main.ts configures
    // FastifyAdapter's staticDir/staticPrefix.
    assetBaseUrl: "/build/",
    viteDevServerUrl: process.env.VITE_DEV_SERVER_URL || "http://localhost:5173",
};
