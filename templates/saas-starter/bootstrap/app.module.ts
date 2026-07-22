import { Module } from "@nyala/core";
import { ConfigService } from "@nyala/config";
import { Logger } from "@nyala/observability";
import { HealthCheckService } from "@nyala/observability";
import { MetricsCollector } from "@nyala/observability";
import { AuditLogger } from "@nyala/audit";
import { JwtStrategy } from "@nyala/security";
import { HealthController } from "../app/controllers/health.controller";
import { AuthController } from "../app/controllers/auth.controller";
import { UsersController } from "../app/controllers/users.controller";
import { AuthService } from "../app/services/auth.service";
import { UsersService } from "../app/services/users.service";
import { namespaces } from "../config";

// `nyala generate controller|service` appends entries here automatically.
@Module({
    imports: [],
    providers: [
        {
            provide: ConfigService,
            useFactory: () => {
                // Load all 13 config/*.ts namespaces so config.get("server.port"),
                // config.get("database.host"), etc. all resolve correctly.
                const configService = new ConfigService({ envFilePath: ".env" });
                for (const [namespace, values] of Object.entries(namespaces)) {
                    if (values && typeof values === "object" && !Array.isArray(values)) {
                        configService.load(namespace, values as Record<string, any>);
                    }
                }
                return configService;
            },
        },
        {
            provide: Logger,
            useFactory: () => {
                return new Logger("saas-app");
            },
        },
        HealthCheckService,
        MetricsCollector,
        AuditLogger,
        {
            provide: JwtStrategy,
            useFactory: (config: ConfigService) => {
                return new JwtStrategy({
                    secret: config.get("JWT_SECRET", "change-me-in-production"),
                    expiresIn: config.get("JWT_EXPIRES_IN", "1h"),
                });
            },
            inject: [ConfigService],
        },
        // Services
        AuthService,
        UsersService,
    ],
    controllers: [
        HealthController,
        AuthController,
        UsersController,
    ],
})
export class AppModule { }
