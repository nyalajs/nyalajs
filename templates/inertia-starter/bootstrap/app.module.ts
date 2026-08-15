import { Module } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { namespaces } from "../config";

// Controllers
import { AuthController } from "../app/controllers/auth.controller";
import { PostsController } from "../app/controllers/posts.controller";

// Services
import { AuthService } from "../app/services/auth.service";
import { PostsService } from "../app/services/posts.service";

// Repositories
import { UserRepository } from "../app/repositories/user.repository";
import { PostRepository } from "../app/repositories/post.repository";

// Guards
import { SessionAuthGuard } from "../app/guards/session-auth.guard";

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
            useFactory: () => new Logger(process.env.APP_NAME ?? "nyala-inertia-app"),
        },
        UserRepository,
        PostRepository,
        AuthService,
        PostsService,
        SessionAuthGuard,
    ],
    controllers: [AuthController, PostsController],
    exports: [ConfigService, Logger],
})
export class AppModule {}
