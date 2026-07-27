import "reflect-metadata";
import * as path from "path";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { registerIslands } from "@nyalajs/react";
import { AppModule } from "./app.module";
import { islands } from "../app/islands/manifest";

async function bootstrap() {
    try {
        const app = await NyalaFactory.create(AppModule);

        const config = app.get<ConfigService>(ConfigService);
        const logger = app.get<Logger>(Logger);

        const publicDir = path.join(__dirname, "../public");

        // Islands: no-op (empty manifest.islands) until you register one —
        // see app/islands/manifest.ts and `nyala build`/`nyala dev`.
        await registerIslands(islands, path.join(__dirname, "../app/islands"), publicDir);

        const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
            staticDir: publicDir,
            staticPrefix: "/public",
            // Sessions power admin auth (see app/guards/session-auth.guard.ts) —
            // SESSION_SECRET/SESSION_SALT are required in .env, no insecure default.
        });

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
        logger.info(`🔑 Admin dashboard: http://${host}:${port}/admin`);
    } catch (error) {
        console.error("❌ Failed to start application:", error);
        process.exit(1);
    }
}

bootstrap();
