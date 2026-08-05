import "dotenv/config";
import "reflect-metadata";
import * as path from "path";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { AssetVersionResolver, configureInertia, InertiaShareMiddleware } from "@nyalajs/inertia";
import { AppModule } from "./app.module";
import { currentUser } from "../app/helpers/current-user.helper";

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
                title: config.get<string>("app.name", "Nyala Inertia App"),
                entry: inertiaConfig.entry,
                viteDevServerUrl: inertiaConfig.viteDevServerUrl,
                assetBaseUrl: inertiaConfig.assetBaseUrl,
            },
        });

        const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
            // Vite's own build output (hashed JS/CSS) is served from here in
            // production — matches vite.config.ts's build.outDir and
            // config/inertia.ts's assetBaseUrl ("/build/"). Same
            // process.cwd()-relative reasoning as `assets` above.
            staticDir: path.join(process.cwd(), inertiaConfig.buildOutDir),
            staticPrefix: inertiaConfig.assetBaseUrl,
            // Sessions power auth (app/guards/session-auth.guard.ts) and
            // flash/validation-error round-tripping (@nyalajs/inertia's
            // flash.ts) — SESSION_SECRET/SESSION_SALT are required in .env,
            // no insecure default.
            session: true,
            // Inertia's client sends the CSRF token back automatically on
            // every request once it's present as a cookie — see
            // docs/inertia-starter-spec.md's "What already exists" section.
            csrf: true,
        });

        // Shares the current user on every InertiaResponse for the
        // request — read by app/components/Layout.tsx via usePage().props.user.
        httpAdapter.addMiddleware(
            new InertiaShareMiddleware(async (req) => ({
                user: currentUser(req),
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
