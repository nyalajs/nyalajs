import "reflect-metadata";
import { NyalaFactory } from "@nyala/core";
import { FastifyAdapter } from "@nyala/http";
import { ConfigService } from "@nyala/config";
import { Logger } from "@nyala/observability";
import { AppModule } from "./app.module";

/**
 * Application Bootstrap
 *
 * Entry point for the Nyala MVC application.
 * Initializes the framework and starts the HTTP server.
 */

async function bootstrap() {
    try {
        // Create application instance
        const app = await NyalaFactory.create(AppModule);

        // Get services
        const config = app.get<ConfigService>(ConfigService);
        const logger = app.get<Logger>(Logger);

        // Create HTTP adapter with security defaults
        const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
            cors: {
                origin: config.get("cors.origin", "*"),
                credentials: config.get("cors.credentials", true),
            },
            helmet: true,
            r"SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));

        // Start server
        const port = config.get<number>("server.port", 3000);
        const host = config.get<string>("server.host", "0.0.0.0");

        await app.listen(port, host);

        logger.info(`🚀 Server running at http://${host}:${port}`);
        logger.info(`📚 API Documentation: http://${host}:${port}/api/docs`);
        logger.info(`💚 Health Check: http://${host}:${port}/health`);
        logger.info(`Environment: ${config.get("app.env", "development")}`);
    } catch (error) {
        console.error("❌ Failed to start application:", error);
        process.exit(1);
    }
}

bootstrap();
