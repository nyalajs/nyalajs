# @nyalajs/microservices

## 1.0.0

### Minor Changes

- Add built-in microservice support via a new `@nyalajs/microservices` package.

  - `@MessagePattern()`/`@EventPattern()` decorators on ordinary `@Controller()` classes, resolved through the same DI container/module graph as HTTP routes.
  - Five transports: TCP, Redis, gRPC, NATS, Kafka — all implementing the same `Transporter`/`ClientProxy` contract, so switching transports is a config change.
  - `MicroserviceFactory.create()` for standalone microservice processes, and `connectMicroservice()`/`startMicroservices()` to attach a transport to an existing HTTP `NyalaApplication` for hybrid apps.
  - `ClientProvider(token, config)` registers a `ClientProxy` as an ordinary DI provider, injected with `@Inject(token)`.
  - Production features: reconnection with backoff, graceful drain shutdown, `@UseGuards`/`@UseInterceptors`/`@UseFilters`+`@Catch` parity with HTTP on message patterns, distributed trace propagation through `LogContext`/`TenantContext`, `@ValidatePayload()`, and health-check integration.

  `@nyalajs/core` gains two new exports (`ModuleGraph`, `Kernel`) that `@nyalajs/microservices` needs to bind pattern handlers against the same module graph HTTP routes use.

### Patch Changes

- Updated dependencies
  - @nyalajs/core@2.3.0
