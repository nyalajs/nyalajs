import { Module } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { HealthCheckService } from "@nyalajs/observability";
import { MetricsCollector } from "@nyalajs/observability";
import { AuditLogger } from "@nyalajs/audit";
import { JwtStrategy, AuthGuard, RolesGuard } from "@nyalajs/security";
import {
    TenantMiddleware,
    JwtTenantResolver,
    SubdomainTenantResolver,
} from "@nyalajs/tenancy";
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
        AuthGuard,
        RolesGuard,
        // Multi-tenancy: resolves the tenant for every request (JWT first,
        // since most routes are authenticated; subdomain as a fallback for
        // pre-auth flows like signup/login) and publishes it via
        // TenantContext, which BaseRepository and @nyalajs/database's Model
        // both read to enforce tenant isolation. Wired as global middleware
        // in config/middleware.ts.
        JwtTenantResolver,
        SubdomainTenantResolver,
        {
            provide: "TENANT_RESOLVERS",
            useFactory: (jwt: JwtTenantResolver, subdomain: SubdomainTenantResolver) => [jwt, subdomain],
            inject: [JwtTenantResolver, SubdomainTenantResolver],
        },
        // Not every route has a tenant (e.g. health checks, tenant signup) —
        // enforcement happens at the repository/Model layer when data is
        // actually accessed, not globally here.
        { provide: "TENANT_REQUIRED", useValue: false },
        TenantMiddleware,
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
