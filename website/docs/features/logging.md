# Logging

Nyala provides structured, JSON-first logging through the `Logger` service in `@nyalajs/observability`, built on top of [Pino](https://getpino.io/). It's automatically registered in the DI container when you import `ObservabilityModule`.

## Quick Start

Import `ObservabilityModule` into your app module to get `Logger` (along with `HealthCheckService` and `MetricsCollector`) registered with zero configuration:

```typescript
import { Module } from '@nyalajs/core';
import { ObservabilityModule } from '@nyalajs/observability';

@Module({
  imports: [ObservabilityModule],
})
export class AppModule {}
```

Then inject `Logger` into any service or controller:

```typescript
import { Injectable } from '@nyalajs/core';
import { Logger } from '@nyalajs/observability';

@Injectable()
export class UsersService {
  constructor(private logger: Logger) {}

  async create(dto: CreateUserDto) {
    this.logger.info('Creating user', { email: dto.email });

    const user = await this.usersRepo.create(dto);

    this.logger.info('User created', { userId: user.id });

    return user;
  }
}
```

## The Logger Service

`Logger` exposes four level methods plus a way to derive scoped child loggers:

```typescript
export class Logger {
  debug(message: string, metadata?: Record<string, any>): void;
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, error?: Error, metadata?: Record<string, any>): void;
  child(bindings: Record<string, any>): Logger;
}
```

Every log line is emitted as structured JSON via Pino, and automatically includes a `serviceName` field:

```typescript
this.logger.info('Order placed', { orderId: order.id, total: order.total });

// Emits (formatted for readability):
// {
//   "level": "info",
//   "time": "2024-01-15T10:30:00.000Z",
//   "serviceName": "nyala-app",
//   "orderId": "ord_123",
//   "total": 49.99,
//   "msg": "Order placed"
// }
```

## Log Levels

`Logger` supports four levels, in increasing severity: `debug`, `info`, `warn`, `error`. The minimum level emitted is controlled by the `LOG_LEVEL` environment variable and defaults to `info`:

```typescript
@Injectable()
export class ReportsService {
  constructor(private logger: Logger) {}

  async generate(userId: string) {
    this.logger.debug('Fetching report data', { userId }); // Hidden unless LOG_LEVEL=debug

    this.logger.info('Report generation started', { userId });

    if (this.isSlowQuery()) {
      this.logger.warn('Report query is running slower than expected', { userId });
    }

    return this.buildReport(userId);
  }
}
```

```env
# .env
LOG_LEVEL=debug   # debug | info | warn | error
```

## Logging Errors

`error()` takes an optional `Error` object as its second argument, separate from the metadata. Nyala captures the error's `message`, `stack`, and `name` into structured fields rather than string-interpolating them:

```typescript
@Injectable()
export class PaymentService {
  constructor(private logger: Logger) {}

  async charge(orderId: string, amount: number) {
    try {
      return await this.stripeClient.charges.create({ amount, currency: 'usd' });
    } catch (error) {
      this.logger.error('Payment charge failed', error as Error, { orderId, amount });
      throw new InternalServerErrorException('Payment failed');
    }
  }
}
```

## Structured Metadata

Always pass contextual data as the `metadata` object rather than interpolating it into the message string — this keeps logs queryable in log aggregation tools:

```typescript
// ✅ Good: structured, queryable fields
this.logger.info('User login', { userId: user.id, ip: request.ip });

// ❌ Avoid: metadata baked into an unstructured string
this.logger.info(`User ${user.id} logged in from ${request.ip}`);
```

## Child Loggers

`child()` returns a new `Logger` with a Pino child logger bound to fixed fields, so you don't have to repeat the same metadata on every call. This is useful for scoping a logger to a request, a job, or a subsystem:

```typescript
@Injectable()
export class OrderProcessor {
  constructor(private logger: Logger) {}

  async process(order: Order) {
    // Every log line from this child logger includes orderId automatically
    const orderLogger = this.logger.child({ orderId: order.id });

    orderLogger.info('Processing started');
    await this.validateInventory(order, orderLogger);
    await this.chargePayment(order, orderLogger);
    orderLogger.info('Processing completed');
  }

  private async validateInventory(order: Order, logger: Logger) {
    logger.debug('Validating inventory');
    // ...
  }
}
```

## Correlating Logs with Requests

Every `Logger` call automatically picks up `requestId`/`traceId`/`tenantId`/`userId` from `LogContext` (`@nyalajs/core`) — no manual binding required. `FastifyAdapter` populates `requestId`/`traceId` in `LogContext` at the start of every request; `TenantMiddleware` and `AuthGuard` fill in `tenantId`/`userId` as they're learned further into the request lifecycle. Just inject `Logger` and call it — anywhere in the call stack for that request, even in code with no access to the request object at all:

```typescript
@Injectable()
export class UsersService {
  constructor(private logger: Logger) {}

  async findById(id: string) {
    // requestId/traceId/tenantId/userId are all attached automatically
    this.logger.info('Fetching user', { userId: id });
    return this.repo.findById(id);
  }
}
```

An explicit `metadata` field passed to a call wins over `LogContext` on a collision (e.g. deliberately overriding `requestId` in a test). `child()` still exists for adding your own extra bindings on top (a job name, a batch ID) — it's just no longer needed purely to thread request correlation through, the way the old pattern in earlier versions of this doc required.

## File Output and Rotation

By default, `Logger` writes to stdout. Set `LOG_FILE` to write to a rotating log file instead, using [`pino-roll`](https://github.com/mcollina/pino-roll) under the hood:

```env
# .env
LOG_FILE=/var/log/nyala/app.log
LOG_MAX_SIZE=10m     # Rotate when the file exceeds this size (default: 10m)
LOG_INTERVAL=1d      # Rotate on this interval (default: 1d)
```

When `LOG_FILE` is set, `Logger` creates the log directory automatically and streams through the rotating transport instead of stdout.

## Silencing Logs in Tests

Since `LOG_LEVEL` is passed straight through to Pino's `level` option, setting it to `silent` in your test environment suppresses log output entirely without touching application code:

```env
# .env.test
LOG_LEVEL=silent
```

## Testing with `Logger`

`Logger` is a regular `@Injectable()` provider, so it can be swapped out with a stub in unit tests instead of asserting against real log output:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  it('logs when a user is created', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const usersRepo = { create: vi.fn().mockResolvedValue({ id: '1' }) };

    const service = new UsersService(usersRepo as any, logger as any);
    await service.create({ email: 'a@b.com' } as any);

    expect(logger.info).toHaveBeenCalledWith('User created', { userId: '1' });
  });
});
```

## Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Minimum level emitted: `debug`, `info`, `warn`, `error` |
| `LOG_FILE` | *(unset)* | Path to a log file. If unset, logs go to stdout |
| `LOG_MAX_SIZE` | `10m` | Max file size before rotation (only used with `LOG_FILE`) |
| `LOG_INTERVAL` | `1d` | Rotation interval (only used with `LOG_FILE`) |
| `APP_NAME` | `nyala-app` | Service name attached to every log line, set via `ObservabilityModule` |

## Custom Service Name

`ObservabilityModule` wires `Logger`'s `serviceName` from the `APP_NAME` environment variable automatically:

```typescript
@Module({
  providers: [
    {
      provide: Logger,
      useFactory: () => new Logger(process.env.APP_NAME ?? 'nyala-app'),
    },
  ],
  exports: [Logger],
})
export class ObservabilityModule {}
```

```env
APP_NAME=orders-service
```

If you construct `Logger` yourself outside of `ObservabilityModule`, remember its constructor expects a `SERVICE_NAME` DI token — provide one explicitly or DI resolution will fail:

```typescript
@Module({
  providers: [
    Logger,
    { provide: 'SERVICE_NAME', useValue: 'orders-service' },
  ],
})
export class OrdersModule {}
```

## Related Observability Services

`ObservabilityModule` registers two other services alongside `Logger` that are useful once logging is in place:

- **`HealthCheckService`** — from `@nyalajs/observability`, for exposing liveness/readiness endpoints.
- **`MetricsCollector`** — from `@nyalajs/observability`, backed by `prom-client`, for exporting Prometheus-style metrics.

```typescript
import { Injectable } from '@nyalajs/core';
import { Logger, HealthCheckService, MetricsCollector } from '@nyalajs/observability';

@Injectable()
export class DiagnosticsService {
  constructor(
    private logger: Logger,
    private health: HealthCheckService,
    private metrics: MetricsCollector
  ) {}
}
```

Both are exported by the same `ObservabilityModule` import shown in Quick Start — no separate registration needed.

## Best Practices

### 1. Log at Service Boundaries, Not Every Line

```typescript
// ✅ Good: log meaningful events
this.logger.info('Order created', { orderId: order.id });
this.logger.error('Payment failed', error, { orderId: order.id });

// ❌ Bad: noisy, low-value logging
this.logger.debug('Entering createOrder method');
this.logger.debug('dto received');
this.logger.debug('calling repository');
```

### 2. Never Log Secrets or Full Payloads

```typescript
// ✅ Good: log identifiers, not sensitive fields
this.logger.info('User registered', { userId: user.id, email: user.email });

// ❌ Bad: leaks password hashes and tokens into log storage
this.logger.info('User registered', { user });
```

### 3. Use `error()`'s Dedicated Error Parameter

```typescript
// ✅ Good: stack trace captured as a structured field
this.logger.error('Failed to send email', error as Error, { userId });

// ❌ Bad: stack trace lost inside a string
this.logger.error(`Failed to send email: ${error}`);
```

### 4. Scope Loggers with `child()` Instead of Repeating Metadata

```typescript
// ✅ Good
const jobLogger = this.logger.child({ jobId: job.id });
jobLogger.info('Started');
jobLogger.info('Finished');

// ❌ Bad: repeats jobId on every call, easy to forget
this.logger.info('Started', { jobId: job.id });
this.logger.info('Finished', { jobId: job.id });
```

### 5. Keep `LOG_LEVEL=debug` Out of Production

```env
# ✅ Good: production
LOG_LEVEL=info

# ❌ Bad: production, floods log storage
LOG_LEVEL=debug
```

## Next Steps

- [Error Handling](./error-handling) - Error management and formatted responses
- [Dependency Injection](../concepts/dependency-injection) - How `Logger` is resolved
