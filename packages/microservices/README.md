# @nyalajs/microservices

Message-pattern microservices for Nyala.js. A controller can carry `@MessagePattern()`/`@EventPattern()` handlers alongside (or instead of) `@Get()`/`@Post()` — they're resolved through the same DI container and module graph as HTTP routes, so services can be split into standalone processes without rewriting business logic.

## Transports

| Transport | Package | Request-response | Events | Notes |
|---|---|---|---|---|
| `tcp` | none (built-in `net`) | native | native | Zero extra deps. Optional shared-secret auth. |
| `redis` | `ioredis` | per-call reply channel | pub/sub | Good default when you already run Redis. |
| `grpc` | `@grpc/grpc-js`, `@grpc/proto-loader` | native (unary RPC) | native (unary RPC, no reply) | Schema-first — see below. |
| `nats` | `nats` | native (request-reply) | native (pub/sub) | Lowest latency of the five; needs a NATS server. |
| `kafka` | `kafkajs` | reply-topic + correlationId | native (topic consumption) | Durable log; best for event-heavy systems. |

All five implement the same `Transporter`/`ClientProxy` contract, so switching transports is a config change, not a rewrite — the same `@MessagePattern("users.findOne")` controller method works unchanged on any of them.

## Quick start

```ts
// users-service (standalone process, no HTTP)
@Controller()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @MessagePattern("users.findOne")
  findOne(@Payload() id: string) {
    return this.usersService.findOne(id);
  }
}

const app = await MicroserviceFactory.create(UsersModule, {
  transport: "tcp",
  options: { port: 4001 },
});
app.enableShutdownHooks(); // SIGTERM/SIGINT -> graceful drain -> exit
await app.listen();
```

```ts
// gateway (HTTP process, calls into users-service)
@Module({
  controllers: [UsersController],
  providers: [ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port: 4001 } })],
})
export class GatewayModule {}

@Injectable()
class UsersService {
  constructor(@Inject("USERS_SERVICE") private client: ClientProxy) {}
  findOne(id: string) { return this.client.send("users.findOne", id); }
}
```

Or run HTTP and a microservice transport in the same process (**hybrid app**):

```ts
const app = await NyalaFactory.create(AppModule);
app.setHttpAdapter(new FastifyAdapter(app.getKernel().getContainer()));
connectMicroservice(app, { transport: "tcp", options: { port: 4001 } });
await startMicroservices(app);
await app.listen(3000);
```

## Production features

**Guards / interceptors / exception filters** — the same `@UseGuards()`, `@UseInterceptors()`, `@UseFilters()` + `@Catch()` decorators HTTP uses work on message patterns too, implementing `MicroserviceGuard`/`MicroserviceInterceptor`/`MicroserviceExceptionFilter` instead of the HTTP-specific interfaces:

```ts
@MessagePattern("orders.create")
@UseGuards(ServiceAuthGuard)
@UseInterceptors(AuditInterceptor)
create(@Payload() dto: CreateOrderDto) { ... }
```

**Payload validation** — `@ValidatePayload(zodSchema)` parses/rejects the payload before the handler runs, mirroring `@nyalajs/validation`'s HTTP decorators:

```ts
@MessagePattern("users.create")
@ValidatePayload(CreateUserSchema)
create(@Payload() dto: CreateUserDto) { ... }
```

**Distributed tracing** — every call carries `{ requestId, traceId, tenantId }`. A traceId is minted on the first hop and threads through `LogContext`/`TenantContext` automatically: if a handler calls another microservice from inside a request, the outbound call continues the same traceId. Access it via `@Ctx()`:

```ts
@MessagePattern("orders.create")
create(@Payload() dto: CreateOrderDto, @Ctx() ctx: MicroserviceContext) {
  logger.info("creating order", { traceId: ctx.trace.traceId });
}
```

**Reconnection** — `TcpClientProxy` and `GrpcClientProxy`/`NatsClientProxy`/`KafkaClientProxy`'s underlying clients reconnect automatically after a dropped connection (TCP with configurable exponential backoff via `reconnect: { initialDelayMs, maxDelayMs, maxRetries }`; Redis/NATS/Kafka clients rely on their own driver's built-in reconnect). In-flight calls reject immediately on disconnect rather than hanging.

**Circuit breaker** — reconnection handles the *connection* dropping and coming back; a circuit breaker handles the *service* being reachable but unhealthy (every call timing out because a downstream handler is deadlocked, say) — piling up more calls against a struggling-but-connected service only makes it worse. Opt in per client via `ClientProvider`'s third argument:

```ts
providers: [
  ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port: 4001 } }, {
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 }, // or just `true` for the defaults
  }),
]
```

After `failureThreshold` consecutive `send()`/`emit()` failures the circuit opens: further calls reject immediately with `CircuitOpenError` without ever reaching the downstream service. After `resetTimeoutMs` it moves to half-open and lets exactly one trial call through — success closes the circuit again, another failure reopens it immediately. `client.isHealthy()` reports `false` while the circuit is open, so it shows up in `microserviceHealthIndicator()` too. `CircuitBreaker` itself (`src/resilience/circuit-breaker.ts`) is transport-agnostic — wrap any `ClientProxy` directly with `new CircuitBreakerClientProxy(client, options)` if you're not going through `ClientProvider`.

**Graceful shutdown** — every transport's `close()` stops accepting new work immediately, waits (`drainTimeoutMs`, default 10s) for in-flight handler calls to finish, then releases the connection. `app.enableShutdownHooks()` wires this to `SIGTERM`/`SIGINT` for container orchestrators.

**Health checks** — every `Transporter` and `ClientProxy` exposes `isHealthy()`. `microserviceHealthIndicator(name, target)` wraps either into the shape `@nyalajs/observability`'s `HealthCheckService.registerIndicator()` expects, without requiring a hard dependency on that package.

**TCP auth** — set `authToken` on both `TcpTransporterOptions` and `TcpClientOptions` to require a shared secret before a connection is allowed to send any pattern. TCP has no built-in transport-level identity; treat an unauthenticated port the same as an unauthenticated database port — fine on a private network/service mesh, not for public exposure.

## gRPC specifics

gRPC is schema-first: the wire contract is a `.proto` file, not something invented per call like TCP/Redis. By default, every `GrpcTransporter`/`GrpcClientProxy` loads the framework's own generic proto (one `Call`/`Emit` RPC, `pattern` field selects the handler, `payload` travels as a JSON string) — so any `@MessagePattern` controller works unchanged with zero proto authoring. Pass your own `protoPath`/`package`/`service` to expose a real typed contract to a non-Nyala gRPC client (Go, Python, ...), as long as it implements the same `Call(Request) returns (Reply)` shape (see `src/transports/grpc/nyala-rpc.proto`'s header comment for the exact fields).

## Kafka specifics

Kafka is a durable log, not a request-reply broker. `@EventPattern` maps directly onto topic consumption — Kafka's native strength. `@MessagePattern` (request-response) needs an explicit reply-topic convention: each `KafkaClientProxy` subscribes to its own per-instance reply topic and correlates responses by a generated `correlationId`. This means **auto topic creation must be enabled** on the broker (Kafka's own default, `auto.create.topics.enable=true`) unless you pre-create both the pattern topics and each client's reply topic — most managed Kafka services (Confluent Cloud, MSK) disable auto-creation by default, so plan topic provisioning accordingly in those environments.

## What's NOT included

- No message replay/dead-letter queue handling — TCP/Redis/gRPC/NATS calls that fail are simply rejected to the caller; Kafka event consumption has no automatic retry/DLQ wiring (build it into your `@EventPattern` handler, or pair with `@nyalajs/queue`, if you need it).
- No built-in load balancing across multiple instances of the same service beyond what each transport's client library does natively (Kafka consumer groups balance automatically; TCP/gRPC/NATS/Redis connect to one configured address — put a load balancer or service-mesh sidecar in front if you need to spread calls across replicas).
- No mTLS setup beyond what each transport's underlying client library exposes via its own `credentials`/`ssl` options (`GrpcTransporterOptions.credentials`, `KafkaTransporterOptions.ssl`).
