import { Module } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { namespaces } from "../config";

// Controllers
import { HomeController } from "../app/controllers/home.controller";
import { AuthController } from "../app/controllers/auth.controller";
import { UsersController } from "../app/controllers/users.controller";
import { TodosController } from "../app/controllers/todos.controller";

// Services
import { AuthService } from "../app/services/auth.service";
import { UsersService } from "../app/services/users.service";
import { TodosService } from "../app/services/todos.service";

// Repositories
import { UserRepository } from "../app/repositories/user.repository";
import { TodoRepository } from "../app/repositories/todo.repository";

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
        {
            provide: Logger,
            useFactory: () => new Logger(process.env.APP_NAME ?? "nyala-app"),
        },
        // Repositories
        UserRepository,
        TodoRepository,
        // Services
        AuthService,
        UsersService,
        TodosService,
    ],
    controllers: [
        HomeController,
        AuthController,
        UsersController,
        TodosController,
    ],
    exports: [
        ConfigService,
        Logger,
        UserRepository,
        TodoRepository,
        AuthService,
        UsersService,
        TodosService,
    ],
})
export class AppModule { }
