# Microservices

`@nyalajs/microservices` adds message-pattern RPC and event handling to Nyala — a controller can carry `@MessagePattern()`/`@EventPattern()` handlers alongside (or instead of) `@Get()`/`@Post()`, resolved through the same DI container and module graph as HTTP routes. Five transports implement the same contract, so switching between them is a config change, not a rewrite.

## Transports

| Transport | Extra package | Request-response | Events | Notes |
|---|---|---|---|---|
| `tcp` | none (built-in `net`) | native | native | Zero extra deps. Optional shared-secret auth. |
| `redis` | `ioredis` | per-call reply channel | pub/sub | Good default when you already run Redis. |
| `grpc` | `@grpc/grpc-js`, `@grpc/proto-loader` | native (unary RPC) | native (unary RPC, no reply) | Schema-first — see below. |
| `nats` | `nats` | native (request-reply) | native (pub/sub) | Lowest latency of the five; needs a NATS server. |
| `kafka` | `kafkajs` | reply-topic + correlation id | native (topic consumption) | Durable log; best for event-heavy systems. |

The same `@MessagePattern("users.findOne")` controller method works unchanged on any of them — only the `transport`/`options` passed to `MicroserviceFactory.create()` (or `ClientProvider()`) changes.

## Quick start

A standalone microservice process, with no HTTP surface at all:

```typescript
import { Controller } from '@nyalajs/core';
import { MessagePattern, Payload, MicroserviceFactory } from '@nyalajs/microservices';

@Controller()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @MessagePattern('users.findOne')
  findOne(@Payload() id: string) {
    return this.usersService.findOne(id);
  }
}

const app = await MicroserviceFactory.create(UsersModule, {
  transport: 'tcp',
  options: { port: 4001 },
});
app.enableShutdownHooks(); // SIGTERM/SIGINT -> graceful drain -> exit
await app.listen();
```

A regular HTTP app calling into it, via a DI-injected client:

```typescript
import { Module, Injectable, Inject } from '@nyalajs/core';
import { ClientProvider, ClientProxy } from '@nyalajs/microservices';

@Module({
  controllers: [UsersController],
  providers: [ClientProvider('USERS_SERVICE', { transport: 'tcp', options: { port: 4001 } })],
})
export class GatewayModule {}

@Injectable()
class UsersService {
  constructor(@Inject('USERS_SERVICE') private client: ClientProxy) {}

  findOne(id: string) {
    return this.client.send('users.findOne', id); // request-response, resolves with the remote handler's return value
  }

  notifyOrderCreated(order: Order) {
    return this.client.emit('order.created', order); // fire-and-forget, no reply expected
  }
}
```

Or run HTTP and a microservice transport in the same process — a **hybrid app**:

```typescript
import { NyalaFactory } from '@nyalajs/core';
import { FastifyAdapter } from '@nyalajs/http';
import { connectMicroservice, startMicroservices } from '@nyalajs/microservices';

const app = await NyalaFactory.create(AppModule);
app.setHttpAdapter(new FastifyAdapter(app.getKernel().getContainer()));

connectMicroservice(app, { transport: 'tcp', options: { port: 4001 } });
await startMicroservices(app);

await app.listen(3000);
```

## `ClientProxy`

```typescript
abstract class ClientProxy {
  connect(): Promise<void>;
  close(): Promise<void>;

  // Request-response: resolves with the remote handler's return value,
  // rejects if it throws, or after timeoutMs (default 10s) with no reply.
  send<TResult = any, TPayload = any>(pattern: string, payload: TPayload, timeoutMs?: number): Promise<TResult>;

  // Fire-and-forget: resolves once handed to the transport, no reply expected.
  emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void>;

  // Best-effort connectivity check — never throws, returns false on any failure.
  isHealthy(): Promise<boolean>;
}
```

`connect()` is called automatically on first `send()`/`emit()` — you don't need to call it yourself unless you want the connection established eagerly.

## Guards, Interceptors, Exception Filters

The same `@UseGuards()`, `@UseInterceptors()`, `@UseFilters()` + `@Catch()` decorators HTTP uses work on message patterns too — implement `MicroserviceGuard`/`MicroserviceInterceptor`/`MicroserviceExceptionFilter` instead of the HTTP-specific interfaces:

```typescript
import { UseGuards, UseInterceptors, UseFilters, Catch } from '@nyalajs/core';
import { MessagePattern, Payload, MicroserviceGuard, MicroserviceExecutionContext } from '@nyalajs/microservices';

class ServiceAuthGuard implements MicroserviceGuard {
  canActivate(context: MicroserviceExecutionContext): boolean {
    return context.ctx.trace.tenantId !== undefined;
  }
}

@Controller()
export class OrdersController {
  @MessagePattern('orders.create')
  @UseGuards(ServiceAuthGuard)
  @UseInterceptors(AuditInterceptor)
  create(@Payload() dto: CreateOrderDto) {
    /* ... */
  }
}
```

```typescript
interface MicroserviceGuard {
  canActivate(context: MicroserviceExecutionContext): Promise<boolean> | boolean;
}

interface MicroserviceInterceptor {
  intercept(context: MicroserviceExecutionContext, next: () => Promise<any>): Promise<any>;
}

interface MicroserviceExceptionFilter<E extends Error = Error> {
  catch(error: E, context: MicroserviceExecutionContext): Promise<any> | any;
}
```

Unlike HTTP's `ExceptionFilter`, there's no `reply` object to write to — an exception filter's `catch()` return value becomes the RPC reply (for a `@MessagePattern`; ignored for `@EventPattern`), or it can throw again to let a subsequent filter (or the default error-frame/log-and-drop behavior) take over.

`MicroserviceExecutionContext` — the counterpart to HTTP's `ExecutionContext`, since there's no request/response pair on a message-pattern transport:

```typescript
interface MicroserviceExecutionContext {
  payload: any;
  ctx: MicroserviceContext; // { pattern, transport, trace }
  container: Container;
  controller: Type;
  handlerName: string;
  kind: 'message' | 'event';
}
```

## Payload Validation

`@ValidatePayload(zodSchema)` parses/rejects the payload before the handler runs, mirroring `@nyalajs/validation`'s HTTP decorators:

```typescript
import { MessagePattern, Payload, ValidatePayload } from '@nyalajs/microservices';

@MessagePattern('users.create')
@ValidatePayload(CreateUserSchema)
create(@Payload() dto: CreateUserDto) {
  /* ... */
}
```

## Distributed Tracing

Every call carries `{ requestId, traceId, tenantId }`. A `traceId` is minted on the first hop and threads through `LogContext`/`TenantContext` automatically — if a handler calls another microservice from inside a request, the outbound call continues the same `traceId`, so a chain of A → B → C calls shares one trace end to end. Access it via `@Ctx()`:

```typescript
import { MessagePattern, Payload, Ctx, MicroserviceContext } from '@nyalajs/microservices';

@MessagePattern('orders.create')
create(@Payload() dto: CreateOrderDto, @Ctx() ctx: MicroserviceContext) {
  logger.info('creating order', { traceId: ctx.trace.traceId });
}
```

## Reconnection

`TcpClientProxy`, `GrpcClientProxy`, `NatsClientProxy`, and `KafkaClientProxy` reconnect automatically after a dropped connection — TCP with configurable exponential backoff:

```typescript
new TcpClientProxy({
  port: 4001,
  reconnect: { initialDelayMs: 200, maxDelayMs: 10_000, maxRetries: -1 }, // -1 = forever
});
```

Redis/NATS/Kafka clients rely on their own driver's built-in reconnect. In-flight calls reject immediately on disconnect rather than hanging.

## Circuit Breaker

Reconnection handles the *connection* dropping and coming back; a circuit breaker handles the *service* being reachable but unhealthy (every call timing out because a downstream handler is deadlocked, say) — piling up more calls against a struggling-but-connected service only makes it worse. Opt in per client via `ClientProvider`'s third argument:

```typescript
import { ClientProvider } from '@nyalajs/microservices';

providers: [
  ClientProvider('USERS_SERVICE', { transport: 'tcp', options: { port: 4001 } }, {
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 }, // or just `true` for the defaults
  }),
]
```

After `failureThreshold` consecutive `send()`/`emit()` failures the circuit opens: further calls reject immediately with `CircuitOpenError` without ever reaching the downstream service. After `resetTimeoutMs` it moves to half-open and lets exactly one trial call through — success closes the circuit again, another failure reopens it immediately. `client.isHealthy()` reports `false` while the circuit is open, so it shows up in health checks too (see below).

Not going through `ClientProvider`? Wrap any `ClientProxy` directly:

```typescript
import { CircuitBreakerClientProxy } from '@nyalajs/microservices';

const client = new CircuitBreakerClientProxy(
  new TcpClientProxy({ port: 4001 }),
  { failureThreshold: 5, resetTimeoutMs: 30_000 }
);
```

## Graceful Shutdown

Every transport's `close()` stops accepting new work immediately, waits (`drainTimeoutMs`, default 10s) for in-flight handler calls to finish, then releases the connection:

```typescript
const app = await MicroserviceFactory.create(UsersModule, { transport: 'tcp', options: { port: 4001 } });
app.enableShutdownHooks(); // wires SIGTERM/SIGINT to a graceful app.close()
await app.listen();
```

## Health Checks

Every `Transporter` and `ClientProxy` exposes `isHealthy()`. `microserviceHealthIndicator(name, target)` wraps either into the shape `@nyalajs/observability`'s `HealthCheckService.registerIndicator()` expects, without requiring a hard dependency on that package:

```typescript
import { microserviceHealthIndicator } from '@nyalajs/microservices';

const usersClient = app.get<ClientProxy>('USERS_SERVICE');
healthCheckService.registerIndicator(
  microserviceHealthIndicator('users-service', usersClient)
);
```

## TCP Auth

Set `authToken` on both `TcpTransporterOptions` and `TcpClientOptions` to require a shared secret before a connection is allowed to send any pattern:

```typescript
// server
await MicroserviceFactory.create(UsersModule, {
  transport: 'tcp',
  options: { port: 4001, authToken: process.env.SERVICE_AUTH_TOKEN },
});

// client
ClientProvider('USERS_SERVICE', {
  transport: 'tcp',
  options: { port: 4001, authToken: process.env.SERVICE_AUTH_TOKEN },
});
```

TCP has no built-in transport-level identity beyond this — treat an unauthenticated port the same as an unauthenticated database port: fine on a private network or behind a service mesh, not for public exposure.

## gRPC Specifics

gRPC is schema-first: the wire contract is a `.proto` file, not something invented per call like TCP/Redis. By default, every gRPC transport/client loads the framework's own generic proto (one `Call`/`Emit` RPC, a `pattern` field selects the handler, the payload travels as a JSON string) — so any `@MessagePattern` controller works unchanged with zero proto authoring:

```typescript
await MicroserviceFactory.create(UsersModule, {
  transport: 'grpc',
  options: { port: 4001 }, // uses the built-in generic proto
});
```

Pass your own `protoPath`/`package`/`service` to expose a real typed contract to a non-Nyala gRPC client (Go, Python, ...), as long as it implements the same `Call(Request) returns (Reply)` shape:

```typescript
await MicroserviceFactory.create(UsersModule, {
  transport: 'grpc',
  options: { port: 4001, protoPath: './protos/users.proto', package: 'users', service: 'UsersService' },
});
```

## Kafka Specifics

Kafka is a durable log, not a request-reply broker. `@EventPattern` maps directly onto topic consumption — Kafka's native strength. `@MessagePattern` (request-response) needs an explicit reply-topic convention: each Kafka client subscribes to its own per-instance reply topic and correlates responses by a generated correlation id.

This means **auto topic creation must be enabled** on the broker (Kafka's own default) unless you pre-create both the pattern topics and each client's reply topic — most managed Kafka services (Confluent Cloud, MSK) disable auto-creation by default, so plan topic provisioning accordingly there.

## What's NOT Included

- **No message replay/dead-letter queue handling** — TCP/Redis/gRPC/NATS calls that fail are simply rejected to the caller; Kafka event consumption has no automatic retry/DLQ wiring. Build it into your `@EventPattern` handler, or pair with `@nyalajs/queue`'s BullMQ-backed job queue, if you need it.
- **No built-in load balancing** across multiple instances of the same service, beyond what each transport's client library does natively (Kafka consumer groups balance automatically; TCP/gRPC/NATS/Redis connect to one configured address — put a load balancer or service-mesh sidecar in front if you need to spread calls across replicas).
- **No mTLS setup** beyond what each transport's underlying client library exposes via its own `credentials`/`ssl` options.

## Next Steps

- [WebSockets](./websockets) - Real-time bidirectional connections (for browser clients, not service-to-service)
- [Streaming](./streaming) - Server-Sent Events and file streaming
- [Multi-Tenancy](../multi-tenancy/overview) - Tenant isolation, including across service calls
