import "dotenv/config";
import "reflect-metadata";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { MailService } from "@nyalajs/mail";
import { Model } from "@nyalajs/database";
import { HealthCheckService } from "@nyalajs/observability";
import { TenantConnectionManager } from "@nyalajs/tenancy";
import { PaymentService, mountWebhookRoute } from "@nyalajs/payments";
import { AppModule } from "./app.module";
import { db, pingDatabase } from "../database/connection";
import { BillingService } from "../app/services/billing.service";

async function bootstrap() {
    const app = await NyalaFactory.create(AppModule, {
        cors: true,
        helmet: true,
        rateLimit: true,
    });

    const config = app.get<ConfigService>(ConfigService);
    const logger = app.get<Logger>(Logger);

    // @nyalajs/permissions' Role/Permission/... classes are
    // @nyalajs/database Models — they need Model.setDatabase() pointed at
    // this app's real connection (the SAME `db` instance database/connection.ts
    // already builds for the rest of the app's raw-Drizzle repositories;
    // no second pool, no second connection).
    Model.setDatabase(db as any);

    // Starts periodic eviction of idle dedicated-tenant connections (see
    // TenantConnectionManager's own doc comment) — a no-op process-wide
    // timer until/unless a tenant is actually migrated to dedicated (see
    // TenantsService.migrateToDedicated()), but must be started
    // unconditionally here since there's no other bootstrap hook for it.
    const tenantConnections = app.get<TenantConnectionManager>(TenantConnectionManager);
    tenantConnections.startIdleSweep();

    // Without this, GET /health/ready returns "up" unconditionally (see
    // HealthCheckService.checkReadiness()'s own doc: "no indicators
    // registered" is treated as healthy) — meaning a load balancer or
    // k8s readiness probe would keep routing traffic to an instance that
    // can't reach Postgres at all. A real `select 1` against the app's
    // actual pool is the whole point of a readiness check.
    const healthCheck = app.get<HealthCheckService>(HealthCheckService);
    healthCheck.registerIndicator({
        name: "database",
        check: async () => {
            try {
                await pingDatabase();
                return { status: "up" };
            } catch (error) {
                return { status: "down", details: { error: error instanceof Error ? error.message : String(error) } };
            }
        },
    });

    // MailService needs a real connect() before anything can send —
    // EmailVerificationService/password-reset both depend on this having
    // already run by the time a request reaches them.
    //
    // Preview-mode fallback checks the RAW env var, not config.get() —
    // config/mail.ts already defaults smtp.host to "localhost" when
    // MAIL_HOST is unset, so config.get("mail.smtp.host") is never falsy
    // and can't be used to detect "no real SMTP configured" itself.
    const hasRealSmtpConfigured = Boolean(process.env.MAIL_HOST);
    const mailService = app.get<MailService>(MailService);
    await mailService.connect({
        host: config.get("mail.smtp.host"),
        port: config.get<number>("mail.smtp.port"),
        secure: config.get<boolean>("mail.smtp.secure"),
        // Read directly from process.env, not config.get(): ConfigService's
        // get() throws on ANY missing/undefined value unless a real
        // (non-undefined) default is passed — and these two are
        // legitimately undefined in dev (config/mail.ts leaves them
        // undefined on purpose when unset). Passing `undefined` itself as
        // the default does NOT satisfy get()'s `defaultValue !== undefined`
        // check, so that would still throw — going straight to the env var
        // is the only way to let these be genuinely optional here.
        // MailService.connect() itself falls back to process.env.MAIL_USER/
        // MAIL_PASS if these are omitted, so this matches its own default.
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
        from: config.get("mail.from.address"),
        // In development with no real SMTP configured, fall back to
        // nodemailer's Ethereal test inbox instead of silently failing
        // every send — see MailService.connect()'s own doc comment.
        preview: config.get("app.env") !== "production" && !hasRealSmtpConfigured,
    });

    // Setup HTTP adapter with security and API docs enabled.
    //
    // session: false — this starter is JWT-only (see AuthService); it never
    // reads/writes a cookie session anywhere. Leaving sessions on by default
    // would require every developer to generate + set SESSION_SECRET and
    // SESSION_SALT before the app can boot AT ALL (FastifyAdapter refuses to
    // start without them — a deliberate, correct fail-closed default from
    // the framework), for a feature this app doesn't use. If you add
    // cookie-based session auth later, remove this override and set
    // SESSION_SECRET (32+ chars)/SESSION_SALT (exactly 16 chars) in .env.
    const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
        cors: true,
        helmet: true,
        rateLimit: true,
        csrf: true,
        swagger: true,
        session: false,
    });

    app.setHttpAdapter(httpAdapter);

    // Mounts a REAL webhook receiver for the default payment gateway (see
    // the PaymentService provider in app.module.ts for which gateway(s) are
    // configured). mountWebhookRoute() needs the raw Fastify instance
    // directly (not a normal @Controller() route) — it registers its own
    // scoped raw-body content-type parser, since every gateway's webhook
    // signature verification needs the exact, unparsed request bytes,
    // which this framework's normal JSON body parsing would otherwise
    // destroy. See @nyalajs/payments' README for mounting more than one
    // gateway's webhook (one mountWebhookRoute() call per gateway/path).
    //
    // mountWebhookRoute() expects a single PaymentGateway (it only ever
    // calls .verifyWebhook(rawBody, headers) on it), but this app's
    // PaymentService can hold several gateways at once — this thin object
    // literal delegates to PaymentService.verifyWebhook(gatewayName, ...)
    // for the DEFAULT gateway specifically, satisfying exactly the one
    // method mountWebhookRoute() actually calls, without needing a second,
    // separately-constructed PaymentGatewayFactory.create() call using the
    // same env vars createPaymentServiceFromEnv() already read.
    const paymentService = app.get<PaymentService>(PaymentService);
    const billingService = app.get<BillingService>(BillingService);
    await mountWebhookRoute(
        httpAdapter.getInstance(),
        {
            verifyWebhook: (rawBody: Buffer, headers: Record<string, string | string[] | undefined>) =>
                paymentService.verifyWebhook(config.get("payments.defaultGateway", "stripe"), rawBody, headers),
        } as any,
        {
            path: "/webhooks/payments",
            onEvent: (event) => billingService.handlePaymentEvent(event),
        }
    );

    // Graceful shutdown — always handle SIGTERM/SIGINT in production
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        await tenantConnections.closeAll();
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
