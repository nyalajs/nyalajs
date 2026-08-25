import "dotenv/config";
import "reflect-metadata";
import * as path from "path";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { AssetVersionResolver, configureInertia, InertiaShareMiddleware } from "@nyalajs/inertia";
import { AppModule } from "./app.module";

async function bootstrap() {
    try {
        const app = await NyalaFactory.create(AppModule);

        const config = app.get<ConfigService>(ConfigService);
        const logger = app.get<Logger>(Logger);

        const inertiaConfig = config.getNamespace<{
            entry: string;
            buildOutDir: string;
            assetBaseUrl: string;
            viteDevServerUrl: string;
        }>("inertia");

        // Same manifest.json AssetVersionResolver reads to build the
        // X-Inertia-Version / 409-reload protocol (see
        // packages/inertia/src/asset-version.ts) — dev mode (NYALA_VITE_DEV,
        // set by `nyala dev`'s ViteDevCommand) never reads it.
        //
        // Resolved against process.cwd(), not __dirname: vite.config.ts's
        // build.outDir ("public/build") is relative to the PROJECT ROOT
        // (where `vite build` runs from), but this file's own __dirname
        // differs between dev (bootstrap/main.ts, one level down from the
        // root) and prod (dist/bootstrap/main.js, still one level down from
        // dist/, which is itself the root) — either way `npm run dev`/
        // `npm start` always launch from the project root, so cwd is the
        // one path that's consistently correct in both cases.
        const assets = new AssetVersionResolver({
            outDir: path.join(process.cwd(), inertiaConfig.buildOutDir),
        });

        // Configures every inertia(req, res, component, props) call site —
        // see packages/inertia/src/inertia.ts's configureInertia() doc
        // comment for why this is a one-time module-level call instead of
        // threading config through every controller.
        configureInertia({
            assets,
            html: {
                title: config.get<string>("app.name", "Nyala Docs"),
                entry: inertiaConfig.entry,
                viteDevServerUrl: inertiaConfig.viteDevServerUrl,
                assetBaseUrl: inertiaConfig.assetBaseUrl,
                // Per-page <Head title="..."/> (see every page component)
                // already overrides <title> client-side after hydration —
                // this default meta description/favicon apply to every
                // page (including the pre-hydration flash and any crawler
                // that never runs JS), same "static defaults, per-page
                // overrides where it matters" split html-shell.ts already
                // uses for <title>.
                head: '<meta name="description" content="Nyala — an enterprise TypeScript framework. Full CRUD documentation, served live from a real database." />\n    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
            },
        });

        // FastifyAdapterOptions.helmet is a hard on/off boolean — there's
        // no way to pass custom Content-Security-Policy directives through
        // it (verified against packages/http/src/runtime/fastify-adapter.ts;
        // the CSP it registers is hardcoded to scriptSrc: ["'self'"]). In
        // dev, html-shell.ts's Vite integration injects an inline
        // React-Refresh preamble <script> plus cross-origin
        // <script src="http://localhost:5173/...\"> tags — both genuinely
        // blocked by that CSP (confirmed live: the browser reported exactly
        // this). Disabling helmet in dev is the only lever this app has;
        // it stays on in production, where the real prod CSP already
        // matches what's actually served (self-origin hashed assets, no
        // inline scripts).
        const isDev = config.get<string>("app.env") !== "production";

        const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
            // Vite's own build output (hashed JS/CSS) is served from here in
            // production — matches vite.config.ts's build.outDir and
            // config/inertia.ts's assetBaseUrl ("/build/"). Same
            // process.cwd()-relative reasoning as `assets` above.
            staticDir: path.join(process.cwd(), inertiaConfig.buildOutDir),
            staticPrefix: inertiaConfig.assetBaseUrl,
            helmet: !isDev,
            // Full CRUD now (create/update/delete docs) — CSRF needs
            // sessions (see @nyalajs/http's FastifyAdapter: CSRF only
            // registers when session is also enabled), and Inertia's
            // client sends the token back automatically once it's present
            // as a cookie, same as inertia-starter's own auth flows.
            session: true,
            csrf: true,
        });

        // Shares whether the current session is logged in as admin on every
        // InertiaResponse — read by docs-layout.tsx / Docs/Show.tsx via
        // usePage().props.isAdmin to decide whether to render the New
        // doc/Edit/Delete buttons at all. This is UI-only; the actual write
        // routes are independently gated server-side by AdminGuard (see
        // app/controllers/docs.controller.ts) — a logged-out visitor
        // couldn't perform a write even if this prop were somehow spoofed.
        httpAdapter.addMiddleware(
            new InertiaShareMiddleware(async (req: any) => ({
                isAdmin: req.session?.get("isAdmin") === true,
            }))
        );

        app.setHttpAdapter(httpAdapter);

        const shutdown = async (signal: string) => {
            logger.info(`${signal} received, shutting down gracefully...`);
            await app.close();
            process.exit(0);
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));

        const port = config.get<number>("server.port", 3000);
        const host = config.get<string>("server.host", "0.0.0.0");

        await app.listen(port, host);

        logger.info(`🚀 Server running at http://${host}:${port}`);
    } catch (error) {
        console.error("❌ Failed to start application:", error);
        process.exit(1);
    }
}

bootstrap();
