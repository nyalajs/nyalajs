import { Module } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { namespaces } from "../config";

// Controllers
import { DocsController } from "../app/controllers/docs.controller";
import { AuthController } from "../app/controllers/auth.controller";

// Services
import { DocsService } from "../app/services/docs.service";

// Repositories
import { DocRepository } from "../app/repositories/doc.repository";

// Guards
import { AdminGuard } from "../app/guards/admin.guard";

/**
 * Application Root Module
 *
 * `nyala generate controller|service` appends new entries here automatically.
 */
@Module({
    providers: [
        {
            provide: ConfigService,
            useFactory: () => {
                const configService = new ConfigService();
                for (const [namespace, values] of Object.entries(namespaces)) {
                    configService.load(namespace, values as Record<string, any>);
                }
                return configService;
            },
        },
        {
            provide: Logger,
            useFactory: () => new Logger(process.env.APP_NAME ?? "nyala-docs-site"),
        },
        DocRepository,
        DocsService,
        AdminGuard,
    ],
    controllers: [DocsController, AuthController],
    exports: [ConfigService, Logger],
})
export class AppModule {}
