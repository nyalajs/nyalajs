import { Module } from "@nyala/core";
import { ConfigService } from "@nyala/config";
import { Logger } from "@nyala/observability";
import { namespaces } from "../config";

// Controllers
import { HomeController } from "../app/controllers/home.controller";
import { AuthController } from "../app/controllers/auth.controller";
import { UsersController } from "../app/controllers/users.controller";

// Services
import { AuthService } from "../app/services/auth.service";
import { UsersService } from "../app/services/users.service";

// Repositories
import { UserRepository } from "../app/repositories/user.repository";

/**
 * Application Root Module
 *
 * Central module that registers all application components:
 * - Controllers: Handle HTTP requests
 * - Services: Business logic layer
 * - Repositories: Data access layer
 */
@Module({
    providers: [
        // Config Service
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
        // Logger
        Logger,
        // Repositories
        UserRepository,
        // Services
        AuthService,
        UsersService,
    ],
    controllers: [
        HomeController,
        AuthController,
        UsersController,
    ],
    exports: [
        ConfigService,
        Logger,
        UserRepository,
        AuthService,
        UsersService,
    ],
})
export class AppModule { }
