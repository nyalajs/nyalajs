import { Module, Scope } from "@nyalajs/core";
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
    TenantRegistry,
    TenantConnectionManager,
    TenantMigrationService,
} from "@nyalajs/tenancy";
import { permissionsProviders } from "@nyalajs/permissions";
import { MailService } from "@nyalajs/mail";
import { PaymentService, createPaymentService } from "@nyalajs/payments";

import { HealthController, MetricsController } from "../app/controllers/health.controller";
import { AuthController } from "../app/controllers/auth.controller";
import { UsersController } from "../app/controllers/users.controller";
import { TeamController } from "../app/controllers/team.controller";
import { TenantsController } from "../app/controllers/tenants.controller";
import { BillingController } from "../app/controllers/billing.controller";

import { AuthService } from "../app/services/auth.service";
import { UsersService } from "../app/services/users.service";
import { EmailVerificationService } from "../app/services/email-verification.service";
import { PasswordResetService } from "../app/services/password-reset.service";
import { TeamService } from "../app/services/team.service";
import { TenantsService } from "../app/services/tenants.service";
import { BillingService } from "../app/services/billing.service";

import { UserRepository } from "../app/repositories/user.repository";
import { TenantRepository } from "../app/repositories/tenant.repository";
import { RefreshTokenRepository } from "../app/repositories/refresh-token.repository";
import { EmailVerificationTokenRepository } from "../app/repositories/email-verification-token.repository";
import { PasswordResetTokenRepository } from "../app/repositories/password-reset-token.repository";
import { TeamInviteRepository } from "../app/repositories/team-invite.repository";
import { SubscriptionRepository } from "../app/repositories/subscription.repository";

import { namespaces } from "../config";

// `nyala generate controller|service` appends entries here automatically.
@Module({
    imports: [],
    providers: [
        {
            provide: ConfigService,
            useFactory: () => {
                // Load all 15 config/*.ts namespaces so config.get("server.port"),
                // config.get("database.host"), config.get("payments.defaultGateway"),
                // etc. all resolve correctly.
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
        MailService,
        {
            provide: JwtStrategy,
            useFactory: (config: ConfigService) => {
                return new JwtStrategy({
                    secret: config.get("JWT_SECRET", "change-me-in-production"),
                    expiresIn: config.get("JWT_EXPIRES_IN", "15m"),
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
        // in bootstrap/main.ts.
        JwtTenantResolver,
        SubdomainTenantResolver,
        {
            provide: "TENANT_RESOLVERS",
            useFactory: (jwt: JwtTenantResolver, subdomain: SubdomainTenantResolver) => [jwt, subdomain],
            inject: [JwtTenantResolver, SubdomainTenantResolver],
        },
        // Not every route has a tenant (e.g. health checks, register,
        // accept-invite, forgot/reset-password) — enforcement happens at
        // the repository/Model layer when data is actually accessed, not
        // globally here.
        { provide: "TENANT_REQUIRED", useValue: false },

        // Dedicated-per-tenant-database support (opt-in — most tenants stay
        // "shared", the default; a tenant only needs a nyala_tenants row at
        // all once it's migrated, see TenantMigrationService below and
        // TenantsService.upgradeToDedicated()). Registered via useFactory,
        // not as bare classes: both constructors take a plain options
        // object/primitive (TenantRegistry's cacheTtlMs: number,
        // TenantConnectionManager's TenantConnectionManagerOptions), and
        // this container's DI can only auto-resolve constructor params that
        // are either real registered classes or have an explicit @Inject()
        // token — a bare `number`/plain-object param has neither, and
        // resolving it bare-class throws "Provider not found: Number"
        // (confirmed against a real Container). TenantMiddleware itself
        // stays a bare class further down: its own primitive params
        // (TENANT_RESOLVERS/TENANT_REQUIRED) are both explicitly
        // @Inject()-tokened by the package itself, which sidesteps this
        // entirely.
        { provide: TenantRegistry, useFactory: () => new TenantRegistry() },
        { provide: TenantConnectionManager, useFactory: () => new TenantConnectionManager() },
        {
            provide: TenantMigrationService,
            useFactory: (registry: TenantRegistry, connections: TenantConnectionManager) => new TenantMigrationService(registry, connections),
            inject: [TenantRegistry, TenantConnectionManager],
        },
        TenantMiddleware,

        // RBAC (@nyalajs/permissions) — "owner" is this starter's own
        // built-in super-admin-within-a-tenant convention (see
        // AuthService.register(), which always grants it to a new tenant's
        // first user), not a cross-tenant platform-admin role — every
        // permission/role check here is still team-scoped to the caller's
        // own tenant (see Subject.tenantId throughout).
        ...permissionsProviders({ superAdminRoles: ["owner"] }),

        // Payments: Stripe is wired by default — enabling a different (or
        // additional) gateway is adding another env-var-driven entry to
        // `gateways` here, see @nyalajs/payments' README for the full list
        // (Chapa, Paystack, Flutterwave, Mollie, Razorpay, Xendit).
        {
            provide: PaymentService,
            useFactory: (config: ConfigService) =>
                createPaymentService({
                    gateways: {
                        stripe: {
                            provider: "stripe",
                            // A placeholder, not an empty string: Stripe's
                            // own SDK throws at CONSTRUCTION time (not just
                            // on first real API call) if given an empty
                            // key — which would crash the entire app at
                            // boot for any developer who hasn't set up
                            // billing yet. A syntactically-valid-looking
                            // placeholder boots fine; only a real checkout
                            // attempt fails, with Stripe's own clear
                            // "Invalid API Key" error.
                            secretKey: config.get("STRIPE_SECRET_KEY", "sk_test_replace_with_your_real_stripe_secret_key"),
                            // No default omitted here by accident: STRIPE_WEBHOOK_SECRET
                            // is legitimately unset until a developer configures Stripe
                            // webhooks, and config.get() throws on ANY missing key unless
                            // a real (non-undefined) default is passed — see main.ts's
                            // mail.smtp.user/pass fix for the same class of bug. An empty
                            // string is a safe placeholder: webhook verification will
                            // fail with Stripe's own clear error at request time, not
                            // crash the whole app at boot.
                            webhookSecret: config.get("STRIPE_WEBHOOK_SECRET", ""),
                        },
                    },
                    default: config.get("payments.defaultGateway", "stripe"),
                }),
            inject: [ConfigService],
        },

        // Repositories
        UserRepository,
        TenantRepository,
        RefreshTokenRepository,
        EmailVerificationTokenRepository,
        PasswordResetTokenRepository,
        TeamInviteRepository,
        SubscriptionRepository,

        // Services
        //
        // AuthService, PasswordResetService, and TeamService all inject
        // request-scoped tokens (REQUEST_CONTEXT and/or REQUEST — see e.g.
        // AuthService's constructor) — they MUST be `scope: Scope.REQUEST`,
        // not left as bare classes (which default to SINGLETON). A
        // SINGLETON that captures a REQUEST-scoped value in its constructor
        // is a classic DI "captive dependency": the container builds it
        // ONCE, on whichever request happens to resolve it first, and every
        // later request — a completely different user — silently reuses
        // that first request's REQUEST_CONTEXT forever. Verified against a
        // real running instance: /auth/me returned "Not authenticated" for
        // every login after the very first one, because AuthService had
        // frozen in the (unauthenticated) /auth/register request's context.
        { provide: AuthService, useClass: AuthService, scope: Scope.REQUEST },
        UsersService,
        EmailVerificationService,
        { provide: PasswordResetService, useClass: PasswordResetService, scope: Scope.REQUEST },
        { provide: TeamService, useClass: TeamService, scope: Scope.REQUEST },
        TenantsService,
        BillingService,

        // Controllers, registered here (not left to the `controllers`
        // array below to auto-register) so each can be `scope:
        // Scope.REQUEST` — necessary for ANY controller that either
        // directly injects a request-scoped token (HealthController
        // injects "RESPONSE") OR transitively depends on a
        // Scope.REQUEST-scoped service (AuthController → AuthService,
        // TeamController → TeamService): the exact same captive-dependency
        // problem applies one level up the graph — a SINGLETON controller
        // built once from whichever request resolves it first permanently
        // caches that first request's service instance (and, transitively,
        // that first request's REQUEST_CONTEXT/REQUEST/RESPONSE) for every
        // later request, regardless of who's actually asking — confirmed
        // with a real DI container test.
        //
        // Every controller is scoped this way, not just the three that
        // currently need it — a future edit to add a request-scoped
        // dependency to any service is otherwise a silent, easy-to-miss way
        // to reintroduce this exact bug. Controllers are cheap to
        // construct; there's no real cost to always doing it per-request.
        { provide: HealthController, useClass: HealthController, scope: Scope.REQUEST },
        { provide: MetricsController, useClass: MetricsController, scope: Scope.REQUEST },
        { provide: AuthController, useClass: AuthController, scope: Scope.REQUEST },
        { provide: UsersController, useClass: UsersController, scope: Scope.REQUEST },
        { provide: TeamController, useClass: TeamController, scope: Scope.REQUEST },
        { provide: TenantsController, useClass: TenantsController, scope: Scope.REQUEST },
        { provide: BillingController, useClass: BillingController, scope: Scope.REQUEST },
    ],
    controllers: [
        HealthController,
        MetricsController,
        AuthController,
        UsersController,
        TeamController,
        TenantsController,
        BillingController,
    ],
})
export class AppModule { }
