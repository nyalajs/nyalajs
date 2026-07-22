import "reflect-metadata";
import { NyalaFactory } from "@nyala/core";
import { FastifyAdapter } from "@nyala/http";
import { ConfigService } from "@nyala/config";
import { Logger } from "@nyala/observability";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NyalaFactory.create(AppModule, {
        cors: true,
        helmet: true,
        rateLimit: true,
    });

    const config = app.get<ConfigService>(ConfigService);
    const logger = app.get<Logger>(Logger);

    // Setup HTTP adapter with security and API docs enabled
    const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
        cors: true,
        helmet: true,
        rateLimit: true,
        csrf: true,
        swagger: true,
    });

    app.setHttpAdapter(httpAdapter);

    // Graceful shutdown — always handle SIGTERM/SIGINT in production
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await app.close();
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    const port = config.get<number>("PORT", 3000);
    const host = config.get<string>("HOST", "0.0.0.0");

    await app.listen(port, host);

    logger.info(`Application started successfully`, {
        port,
        host,
        environment: process.env.NODE_ENV,
    });
}

bootstrap().catch((error) => {
    console.error("Failed to start application:", error);
    process.exit(1);
});
