# microservices-app

Three independent Nyala processes talking over `@nyalajs/microservices`, using two different transports:

- **users-service** — a standalone microservice with no HTTP surface. Exposes `users.findOne`/`users.findAll` as `@MessagePattern()` request-response handlers, over **TCP**.
- **notifications-service** — a standalone microservice with no HTTP surface. Listens for `order.created` as an `@EventPattern()` fire-and-forget handler, over **NATS**.
- **gateway** — a regular HTTP app. Its controllers don't talk to a database directly: `UsersController` calls users-service (request-response, `client.send()`), and `OrdersController` notifies notifications-service (fire-and-forget, `client.emit()`) — both through an injected `ClientProxy`.

## Run it

Requires a NATS server for the notifications flow — the users/gateway request-response flow works without one:

```bash
docker run -d --name nyala-example-nats -p 4222:4222 nats:2-alpine
```

Then, one process per terminal:

```bash
# terminal 1
npm run dev:users

# terminal 2
npm run dev:notifications

# terminal 3
npm run dev:gateway

# terminal 4
curl http://localhost:3000/users
curl http://localhost:3000/users/1
curl -X POST http://localhost:3000/orders -H 'content-type: application/json' -d '{"userId":"1"}'
```

The `curl -X POST /orders` call returns immediately with the created order — watch terminal 2 (notifications-service) to see it log the event a moment later, including the `traceId` it inherited from the gateway's HTTP request.

## What to look at

- [src/users-service/users.controller.ts](src/users-service/users.controller.ts) — `@MessagePattern`/`@Payload`, request-response, no `@Get`/`@Post` at all.
- [src/notifications-service/notifications.controller.ts](src/notifications-service/notifications.controller.ts) — `@EventPattern`/`@Payload`/`@Ctx`, fire-and-forget, and reading the propagated `traceId` off `MicroserviceContext`.
- [src/gateway/users.controller.ts](src/gateway/users.controller.ts) — a normal HTTP controller whose only dependency is a `ClientProxy`, calling `send()`.
- [src/gateway/orders.controller.ts](src/gateway/orders.controller.ts) — same pattern, but `emit()` for fire-and-forget instead of `send()`.
- [src/gateway/gateway.module.ts](src/gateway/gateway.module.ts) — `ClientProvider(token, options)` registers each client as an ordinary DI provider, injected with `@Inject(token)` like anything else — one per transport, side by side in the same module.

Swap any side to a different transport (Redis, gRPC, Kafka) by changing its `{ transport: ..., options: {...} }` config — the controller code doesn't change either way.
