# Monitoring

`@nyalajs/observability` ships three pieces: a `Logger`, a `HealthCheckService`, and a `MetricsCollector`, plus an `ObservabilityModule` that wires all three into the DI container. This page documents exactly what each one does — based on `packages/observability/src/health/health-check.ts`, `packages/observability/src/metrics/metrics-collector.ts`, `packages/observability/src/logging/logger.ts`, and `packages/observability/src/index.ts` — and how (and whether) each starter actually exposes them over HTTP.

## Health Checks

### The service

`HealthCheckService` (`packages/observability/src/health/health-check.ts`) is small and has exactly two public check methods plus a way to register custom indicators:

```typescript
export interface HealthCheckResult {
    status: "up" | "down";
    details?: Record<string, any>;
}

export interface HealthIndicator {
    name: string;
    check(): Promise<HealthCheckResult>;
}

@Injectable()
export class HealthCheckService {
    private indicators: HealthIndicator[] = [];

    registerIndicator(indicator: HealthIndicator): void {
        this.indicators.push(indicator);
    }

    async checkLiveness(): Promise<{ status: "up" | "down" }> {
        // Liveness just checks if the process is running
        return { status: "up" };
    }

    async checkReadiness(): Promise<{
        status: "up" | "down";
        checks: Record<string, HealthCheckResult>;
    }> {
        const checks: Record<string, HealthCheckResult> = {};
        let overallStatus: "up" | "down" = "up";

        for (const indicator of this.indicators) {
            try {
                const result = await indicator.check();
                checks[indicator.name] = result;

                if (result.status === "down") {
                    overallStatus = "down";
                }
            } catch (error) {
                checks[indicator.name] = {
                    status: "down",
                    details: {
                        error: error instanceof Error ? error.message : "Unknown error",
                    },
                };
                overallStatus = "down";
            }
        }

        return { status: overallStatus, checks };
    }
}
```

Two things worth being precise about:

- **`checkLiveness()` never fails.** It doesn't ping anything — as long as the process is alive enough to run this method, it returns `{ status: "up" }`. That's the correct semantics for a liveness probe (a process that's up but stuck should still be restarted by other means, e.g. deadlock detection — this method isn't meant to catch that).
- **`checkReadiness()` is only as useful as the indicators you register.** With zero indicators registered — the default in every starter — `checkReadiness()` always returns `{ status: "up", checks: {} }`, regardless of whether your database, cache, or any downstream dependency is actually reachable. No starter template currently calls `registerIndicator()` for anything (no built-in database indicator ships in `@nyalajs/observability` or elsewhere in the packages checked). If you want the readiness probe to reflect real dependency health — which matters if you're using it to gate a Kubernetes rollout, see [Kubernetes](./kubernetes) — you need to register one yourself:

```typescript
import { HealthCheckService, HealthIndicator } from "@nyalajs/observability";

class DatabaseHealthIndicator implements HealthIndicator {
    name = "database";

    constructor(private readonly db: /* your DB connection/client */ any) {}

    async check() {
        try {
            await this.db.query("SELECT 1");
            return { status: "up" as const };
        } catch (error) {
            return {
                status: "down" as const,
                details: { error: error instanceof Error ? error.message : "unknown" },
            };
        }
    }
}

// wherever your app bootstraps, after both are resolved from the container:
healthCheckService.registerIndicator(new DatabaseHealthIndicator(db));
```

### How each starter exposes it

The three starters diverge here — don't assume they all behave the same way.

**`saas-starter`** wires the real `@nyalajs/observability` services. `bootstrap/app.module.ts` provides `HealthCheckService` and `MetricsCollector` directly as providers, and `app/controllers/health.controller.ts` exposes them over HTTP:

```typescript
// templates/saas-starter/app/controllers/health.controller.ts
@Injectable()
@Controller("/health")
@Version("1")
export class HealthController {
    constructor(
        private readonly healthCheck: HealthCheckService,
        private readonly metrics: MetricsCollector
    ) { }

    @Get("/live")
    async liveness() {
        return await this.healthCheck.checkLiveness();
    }

    @Get("/ready")
    async readiness() {
        return await this.healthCheck.checkReadiness();
    }
}
```

Because the controller carries `@Version("1")`, and the framework's route resolver prepends a `/v{version}` segment ahead of the controller's prefix (`packages/core/src/routing/route-resolver.ts`), the routes this actually registers are:

- `GET /v1/health/live` → `{ "status": "up" }`
- `GET /v1/health/ready` → `{ "status": "up", "checks": {} }` (empty, per the no-indicators-registered note above)

This is the same file where `MetricsController` (below) is defined, and `HealthController` is the only one of the two actually listed in `app.module.ts`'s `controllers: [...]` array — so `/metrics` is not live by default even though the code for it exists in the repo. See [Metrics](#metrics) below.

**`basic-starter`** does *not* use `@nyalajs/observability`'s health service at all. Its `HomeController` (`app/controllers/home.controller.ts`) hand-rolls three routes with no `@Version` decorator, so they're unversioned:

```typescript
// templates/basic-starter/app/controllers/home.controller.ts
@Get("/health")
async health() {
    return {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
    };
}

@Get("/health/live")
async liveness() {
    return { status: "alive" };
}

@Get("/health/ready")
async readiness() {
    // Add database connection check here
    return { status: "ready" };
}
```

- `GET /health` → status/timestamp/uptime/memory payload (this is the endpoint the Dockerfile's `HEALTHCHECK` instruction targets — see [Docker](./docker))
- `GET /health/live` → `{ "status": "alive" }`
- `GET /health/ready` → `{ "status": "ready" }` — the comment `// Add database connection check here` is left as a to-do in the template; it does not actually check anything yet.

Note the different response shapes and status strings (`"ok"`/`"alive"`/`"ready"` here vs. `"up"`/`"down"` from `HealthCheckService`) — these are two independently-written implementations, not the same code path.

**`cms-starter`** has no health or readiness endpoint at all currently — there's no `HealthController`, no `HomeController` equivalent with a `/health` route, and `@nyalajs/observability` isn't wired into its `bootstrap/app.module.ts`. If you need one, the most direct route is to copy the `basic-starter` pattern or wire in `ObservabilityModule` (see [Wiring It Into Your Own App](#wiring-it-into-your-own-app) below).

## Metrics

### The collector

`MetricsCollector` (`packages/observability/src/metrics/metrics-collector.ts`) wraps a `prom-client` `Registry` and pre-registers four metrics:

| Metric | Type | Labels | Notes |
|--------|------|--------|-------|
| `http_requests_total` | Counter | `method`, `path`, `status`, `tenant` | |
| `http_request_duration_seconds` | Histogram | `method`, `path`, `status`, `tenant` | Buckets: `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]` |
| `http_requests_active` | Gauge | (none set explicitly) | |
| `http_errors_total` | Counter | `method`, `path`, `status`, `tenant` | |

The public API:

```typescript
incrementCounter(name: string, labels?: Record<string, string>): void
recordHistogram(name: string, value: number, labels?: Record<string, string>): void
setGauge(name: string, value: number, labels?: Record<string, string>): void
incrementGauge(name: string, labels?: Record<string, string>): void
decrementGauge(name: string, labels?: Record<string, string>): void
async getMetrics(): Promise<string>
```

::: warning Metric names are hardcoded, not dynamic
Every one of these methods dispatches on `name` with an `if`/`else if` against the four literal strings above (`"http_requests_total"`, `"http_errors_total"`, `"http_request_duration_seconds"`, `"http_requests_active"`). Calling `incrementCounter("my_custom_metric")` with any other name **silently does nothing** — it's not registered on the underlying `prom-client` registry and there's no fallback or dynamic metric creation. If you need additional application-specific metrics, you currently need to extend `MetricsCollector` itself (or use `prom-client` directly) rather than passing a new name string into these methods.
:::

`getMetrics()` returns `await this.registry.metrics()` — the standard Prometheus text exposition format, ready to be served as-is from an HTTP endpoint.

### Exposing `/metrics` over HTTP

`saas-starter`'s `app/controllers/health.controller.ts` also defines a `MetricsController` in the same file as `HealthController`:

```typescript
@Injectable()
@Controller("/metrics")
export class MetricsController {
    constructor(private readonly metrics: MetricsCollector) { }

    @Get("/")
    async getMetrics() {
        return await this.metrics.getMetrics();
    }
}
```

This has no `@Version` decorator, so if it were registered its route would be unversioned: `GET /metrics`.

**However** — checking `bootstrap/app.module.ts`, only `HealthController` is imported and listed in the module's `controllers: [...]` array; `MetricsController` is neither imported nor registered. So as shipped, `saas-starter` does **not** expose `/metrics` over HTTP, even though the code for it exists in the same file. To enable it, add it in `bootstrap/app.module.ts`:

```typescript
// import alongside HealthController
import { HealthController, MetricsController } from "../app/controllers/health.controller";

// ...

controllers: [
    HealthController,
    MetricsController, // add this line
    AuthController,
    UsersController,
],
```

`basic-starter` and `cms-starter` don't define a metrics controller or reference `MetricsCollector` anywhere in their app code.

### Pointing Prometheus at it

Once `MetricsController` is registered (or you've built your own equivalent route calling `metricsCollector.getMetrics()`), a standard Prometheus scrape config looks like:

```yaml
# prometheus.yml — not part of this repo, an example external Prometheus config
scrape_configs:
  - job_name: 'nyala-saas-app'
    scrape_interval: 15s
    static_configs:
      - targets: ['saas-app:3000']
    metrics_path: /metrics
```

If you're running on the Kubernetes manifest from [Kubernetes](./kubernetes), point this at the Service's `ClusterIP` (or add a `prometheus.io/scrape` annotation to the pod template if you're using annotation-based service discovery — not something this repo currently sets up).

The four metrics above are enough to build basic Grafana panels for request rate (`rate(http_requests_total[5m])`), error rate (`rate(http_errors_total[5m])`), P95/P99 latency (from `http_request_duration_seconds`), and concurrency (`http_requests_active`) — but note nothing in this codebase currently *populates* these metrics automatically on every request (there's no HTTP middleware in the packages read that calls `incrementCounter`/`recordHistogram` on each request). You would need to call these methods yourself, e.g. from a middleware or interceptor, for the numbers to reflect real traffic.

## Logging

`Logger` (`packages/observability/src/logging/logger.ts`) is a thin wrapper around `pino`:

```typescript
export interface LogEntry {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    requestId?: string;
    traceId?: string;
    tenantId?: string;
    userId?: string;
    serviceName: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

@Injectable()
export class Logger {
    constructor(
        @Inject("SERVICE_NAME") private readonly serviceName: string = "nyala-app"
    ) { /* ... */ }

    debug(message: string, metadata?: Record<string, any>): void
    info(message: string, metadata?: Record<string, any>): void
    warn(message: string, metadata?: Record<string, any>): void
    error(message: string, error?: Error, metadata?: Record<string, any>): void
    child(bindings: Record<string, any>): Logger
}
```

Every log call attaches `serviceName` automatically. `error()` additionally serializes an `Error` object into `{ message, stack, name }` if one is passed. `child(bindings)` returns a new `Logger` wrapping a `pino` child logger with the given bindings pre-attached — useful for e.g. attaching a `requestId` for the lifetime of one request.

Configuration is read directly from `process.env` inside the constructor, not through `ConfigService`:

- `LOG_LEVEL` — pino level (default `info`)
- `LOG_FILE` — if set, output goes through `pino-roll` to that file path instead of stdout
- `LOG_MAX_SIZE` — rotation size threshold when `LOG_FILE` is set (default `10m`)
- `LOG_INTERVAL` — rotation interval when `LOG_FILE` is set (default `1d`)

`ObservabilityModule` (`packages/observability/src/index.ts`) provides `Logger` via a factory that binds `process.env.APP_NAME ?? "nyala-app"` as the service name:

```typescript
@Module({
    imports: [],
    providers: [
        {
            provide: Logger,
            useFactory: () => new Logger(process.env.APP_NAME ?? "nyala-app"),
        },
        HealthCheckService,
        MetricsCollector,
    ],
    controllers: [],
    exports: [Logger, HealthCheckService, MetricsCollector],
})
export class ObservabilityModule {}
```

`saas-starter` doesn't import `ObservabilityModule` itself — it re-provides `Logger`, `HealthCheckService`, and `MetricsCollector` individually in its own `app.module.ts` (with its own factory hardcoding the service name `"saas-app"` instead of reading `APP_NAME`). `basic-starter` provides `Logger` directly too (with no factory, so it falls back to the `SERVICE_NAME` DI token's default of `"nyala-app"` unless something else binds that token). Neither currently imports `ObservabilityModule` wholesale.

## Wiring It Into Your Own App

The cleanest path — using `ObservabilityModule` as intended, rather than each starter's slightly different manual provider list — looks like:

```typescript
import { Module } from "@nyalajs/core";
import { ObservabilityModule, HealthCheckService, MetricsCollector } from "@nyalajs/observability";
import { HealthController, MetricsController } from "./app/controllers/health.controller";

@Module({
    imports: [ObservabilityModule],
    controllers: [HealthController, MetricsController],
})
export class AppModule {}
```

Then register any `HealthIndicator`s you need (database, external API, queue connectivity) before your app starts accepting readiness-gated traffic, as shown in [Health Checks](#health-checks) above.

## Pointing External Monitoring At It

Once endpoints are live:

- **Uptime / liveness checks** — point at `/health` (`basic-starter`) or `/v1/health/live` (`saas-starter`, once you've fixed the versioned-route mismatch noted in [Kubernetes](./kubernetes)).
- **Load balancer / orchestrator readiness gating** — use `/health/ready` (`basic-starter`, currently a stub) or `/v1/health/ready` (`saas-starter`, currently empty unless you register indicators). Don't wire either into a Kubernetes readiness probe as a proxy for "database is up" until you've actually registered a `HealthIndicator` that checks it — see above.
- **Metrics scraping** — `/metrics`, once `MetricsController` is registered (`saas-starter`) or you've built an equivalent route (`basic-starter`, `cms-starter`).
- **Structured logs** — `Logger` emits JSON via `pino` to stdout by default (or to a rotated file if `LOG_FILE` is set), which is friendly to any log shipper that tails container stdout (Fluent Bit, Vector, CloudWatch Logs agent, etc.) without extra configuration on the app side.

## Next Steps

- [Kubernetes](./kubernetes) — the liveness/readiness probe paths, and the versioning mismatch to fix before relying on them
- [Environment Variables](./environment) — `LOG_LEVEL`, `LOG_FILE`, `SERVICE_NAME`/`APP_NAME`, and the rest
- [Production Checklist](./checklist) — a consolidated pre-deploy checklist
