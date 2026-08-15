# Core Services

Built-in services shipped across `@nyalajs/*` packages, with their real method signatures. Every class name and method below is taken directly from source — see each linked feature page for full usage patterns and examples.

## `ConfigService` (`@nyalajs/config`)

```typescript
@Injectable()
export class ConfigService {
  load(namespace: string, values: Record<string, any>): void;
  get<T = any>(key: string, defaultValue?: T): T;
  getOrThrow<T = any>(key: string): T;
  getNamespace<T = Record<string, any>>(namespace: string): T;
  getAll(): Record<string, any>;
}
```

There's no `getNumber()`/`getBoolean()` — `get()` returns whatever type `T` you ask for; env values loaded via `.env` are strings unless you coerce them yourself (e.g. `Number(config.get('PORT', '3000'))`).

```typescript
@Injectable()
export class AppService {
  constructor(private config: ConfigService) {}

  getPort() {
    return Number(this.config.get('server.port', 3000));
  }
}
```

## `Logger` (`@nyalajs/observability`)

Pino-backed structured logging — the class is `Logger`, not `LoggerService`, and its methods are `debug`/`info`/`warn`/`error`, not Nest-style `log()`/`verbose()`:

```typescript
@Injectable()
export class Logger {
  debug(message: string, metadata?: Record<string, any>): void;
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, error?: Error, metadata?: Record<string, any>): void;
  child(bindings: Record<string, any>): Logger;
}
```

Every call automatically picks up `requestId`/`traceId`/`tenantId`/`userId` from the current request's `LogContext` — see [Logging](../features/logging) for how that correlation works and why you rarely need `child()` for per-request context.

```typescript
@Injectable()
export class UsersService {
  constructor(private logger: Logger) {}

  async create(dto: CreateUserDto) {
    this.logger.info('Creating user', { email: dto.email });
    // ...
  }
}
```

## `EventEmitter` (`@nyalajs/events`)

In-process pub-sub — `on`/`off`/`emit` are real; there's no `once()`. `emit()` fires listeners asynchronously without waiting for them; use `emitSync()` to await every listener before returning:

```typescript
export class EventEmitter {
  on<T>(event: string, handler: (payload: T) => void | Promise<void>): void;
  off<T>(event: string, handler: (payload: T) => void | Promise<void>): void;
  emit<T>(event: string, payload: T): void;
  emitSync<T>(event: string, payload: T): Promise<void>;
}
```

```typescript
@Injectable()
export class OrdersService {
  constructor(private events: EventEmitter) {}

  async create(dto: CreateOrderDto) {
    const order = await this.repo.create(dto);
    this.events.emit('order.created', order);
    return order;
  }
}

@Injectable()
export class EmailService {
  constructor(private events: EventEmitter) {
    this.events.on('order.created', this.sendOrderEmail.bind(this));
  }

  private async sendOrderEmail(order: Order) {
    // ...
  }
}
```

There's also a decorator-based `EventBus` (`@nyalajs/events`) for class-method event listeners — see the package source (`packages/events/src/event-bus.ts`) if you need that instead of manual `on()`/`off()` wiring.

## `CacheService` (`@nyalajs/cache`)

Redis-backed with an automatic in-memory fallback when no `REDIS_URL` is configured:

```typescript
@Injectable()
export class CacheService {
  connect(config?: CacheConfig): Promise<void>;
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  forget(key: string): Promise<void>;
  flush(): Promise<void>;
  remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T>;
}
```

There's no `delete()`/`clear()`/`has()` — the real names are `forget()` and `flush()`, and there's no existence check beyond `get()` returning `null`. See [Caching](../features/caching) for the full API including the `@Cacheable()`/`@CacheEvict()` decorators.

```typescript
@Injectable()
export class ProductsService {
  constructor(private cache: CacheService) {}

  async findById(id: string) {
    return this.cache.remember(`product:${id}`, 3600, () => this.repo.findById(id));
  }
}
```

## `SchedulerService` (`@nyalajs/scheduler`)

Cron jobs are declared with the `@Scheduled()` decorator on a provider method, not by calling `.schedule()`/`.interval()`/`.timeout()` imperatively — there's no such API:

```typescript
import { Injectable } from '@nyalajs/core';
import { Scheduled } from '@nyalajs/scheduler';

@Injectable()
export class TasksService {
  @Scheduled({ cron: '0 0 * * *', name: 'nightly-cleanup' })
  async cleanup() {
    // Runs every day at midnight
  }
}
```

`SchedulerService` itself is the framework-internal class that scans providers for `@Scheduled()` methods and registers real `node-cron` jobs at boot — you don't call methods on it directly. It also supports an optional Redis-backed distributed lock (`SchedulerService.connect({ redisUrl })`) so a given job only runs on one replica when the app is scaled out — see the package README/source (`packages/scheduler/src/scheduler.service.ts`) for that config.

## `QueueService` (`@nyalajs/queue`)

```typescript
@Injectable()
export class QueueService {
  connect(config?: QueueConfig): Promise<void>;
  dispatch(queueName: string, jobName: string, data?: JobPayload): Promise<void>;
  process(queueName: string, handler: (job: { name: string; data: JobPayload }) => Promise<void>): void;
}
```

The real dispatch method is `dispatch()`, not `add()`. With no `url` passed to `connect()`, jobs run in-process and non-persistently (fine for dev/tests); pass a Redis URL to get BullMQ-backed durable queues.

```typescript
@Injectable()
export class EmailService {
  constructor(private queue: QueueService) {}

  async sendWelcomeEmail(email: string) {
    await this.queue.dispatch('emails', 'welcome', { email });
  }

  onModuleInit() {
    this.queue.process('emails', async (job) => {
      if (job.name === 'welcome') {
        await this.processWelcomeEmail(job.data);
      }
    });
  }
}
```

## Not a Built-In Service

There is no `HttpService` for making outbound HTTP requests — Nyala doesn't ship an Axios/`fetch` wrapper. Use `fetch` (built into Node 18+) or a library of your choice directly in a service.

## Next Steps

- [HTTP](./http) - `FastifyAdapterOptions` and the real request/response model
- [Security](./security) - Guards, hashing, JWT
- [Caching](../features/caching) - `CacheService` in full, including decorators
- [Services](../building-blocks/services) - Creating services
