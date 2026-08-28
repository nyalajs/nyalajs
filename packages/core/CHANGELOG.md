# @nyalajs/core

## 2.3.2

### Patch Changes

- Fix a severe bug where `RouteResolver` silently dropped a controller's routes (no error, no log) whenever the controller — or anything in its dependency graph — needed a request-scoped provider that isn't available at eager singleton-resolution time. This is expected and correct for request-scoped controllers/services, but the old code treated any resolution failure as fatal and simply discarded the routes with zero output. Now it warns loudly instead, and the routes are still registered normally either way (real resolution happens correctly per-request regardless of this eager sanity-check's outcome).

  Also fixes `NyalaApplication.bindRoutes()`'s auto-registration of `config/middleware.ts`'s global middleware list: it looked up `ConfigService` by the string token `"ConfigService"`, but the documented registration pattern uses the class itself as the token, so the lookup always failed and every app's global middleware (e.g. `@nyalajs/tenancy`'s `TenantMiddleware`) silently never ran on any request. Fixed with a fallback lookup by provider-token name, and loud warnings instead of silent failure on any other registration error.

## 2.3.1

### Patch Changes

- Add WebSocket gateways, streaming (SSE/file/LLM-token-bridge), and Cloudflare R2 support.

  **`@nyalajs/http`**
  - `@WebSocketGateway()`/`@SubscribeMessage()`/`@BinaryMessage()`/`@OnConnect()`/`@OnDisconnect()`/`@MessageBody()`/`@ConnectedSocket()` — real-time bidirectional WebSocket gateways resolved through the same DI container as HTTP controllers, backed by `@fastify/websocket`. Opt-in via `websocket: true` on `FastifyAdapterOptions`. Includes room support (`socket.join()`/`.broadcast()`) and native binary frame handling (`@BinaryMessage()`, `socket.emitBinary()`), routed by `ws`'s own binary-frame flag, not JSON-in-base64.
  - `SseStream`/`StreamableResponse` — a handler can now return a streamed response (Server-Sent Events, or any raw `Readable`) instead of a plain object; the adapter pipes it and logs completion on actual stream end.
  - `asyncIterableToSse()` — bridges any `AsyncIterable<string>` (e.g. `@nyalajs/ai`'s `AiService.stream()`) onto an `SseStream`, for streaming an LLM reply to a browser token-by-token.
  - Fixed a Fastify bug where an `async` route handler that `await`s anything before `reply.send(readableStream)` silently truncated the response to its first chunk — every route now registers with a synchronous outer handler internally, with no change in behavior for non-streamed responses.
  - Added a README (previously missing despite being referenced in `package.json`).

  **`@nyalajs/storage`**
  - `StorageDisk.stream()`/`.putStream()` — streamed read/write on every disk (`LocalDisk`, `S3Disk`, now `R2Disk`), so large files are never fully buffered in memory. S3-compatible `putStream()` uses `@aws-sdk/lib-storage`'s multipart `Upload` (a raw `PutObjectCommand` can't accept a stream of unknown length).
  - `R2Disk` — Cloudflare R2 support, a thin config wrapper over `S3Disk`. Auto-builds the account-scoped endpoint and sets `region: "auto"` / `forcePathStyle: true`. `url()` requires an explicit `publicUrl` (R2 has no bucket-derivable public URL) and throws a clear, actionable error if omitted.
  - Added a README (previously missing despite being referenced in `package.json`).

  **`@nyalajs/core`**
  - `NyalaApplication.bindRoutes()` is now `async` (backward compatible — existing unawaited calls still work; `listen()` and `TestingModule` both now await it) and gained a duck-typed hook so an HTTP adapter can register WebSocket gateway routes at the right point in the boot sequence, without core knowing anything about WebSockets.
  - Added a README (previously missing despite being referenced in `package.json`).

  **`@nyalajs/testing`**
  - `TestingModuleBuilder.compile()` now awaits `app.bindRoutes()`, matching its new async signature.
  - Added a README (previously missing despite being referenced in `package.json`).

## 2.3.0

### Minor Changes

- Add built-in microservice support via a new `@nyalajs/microservices` package.

  - `@MessagePattern()`/`@EventPattern()` decorators on ordinary `@Controller()` classes, resolved through the same DI container/module graph as HTTP routes.
  - Five transports: TCP, Redis, gRPC, NATS, Kafka — all implementing the same `Transporter`/`ClientProxy` contract, so switching transports is a config change.
  - `MicroserviceFactory.create()` for standalone microservice processes, and `connectMicroservice()`/`startMicroservices()` to attach a transport to an existing HTTP `NyalaApplication` for hybrid apps.
  - `ClientProvider(token, config)` registers a `ClientProxy` as an ordinary DI provider, injected with `@Inject(token)`.
  - Production features: reconnection with backoff, graceful drain shutdown, `@UseGuards`/`@UseInterceptors`/`@UseFilters`+`@Catch` parity with HTTP on message patterns, distributed trace propagation through `LogContext`/`TenantContext`, `@ValidatePayload()`, and health-check integration.

  `@nyalajs/core` gains two new exports (`ModuleGraph`, `Kernel`) that `@nyalajs/microservices` needs to bind pattern handlers against the same module graph HTTP routes use.

## 2.2.0

### Minor Changes

- Type-scoped exception filters, `nyala db:diff`, and CLI generator fixes.

  - New `@Catch(...errorTypes)` and `@UseFilters(...filters)` decorators (`@nyalajs/core`) plus an `ExceptionFilter` interface (`@nyalajs/http`): a pluggable, type-scoped alternative to the single global `ExceptionHandler`. A filter registered via `@Catch(SomeError)` only runs for errors that are `instanceof SomeError`; anything else falls through to the framework's default error handling. Fully additive — no behavior change for routes with no `@UseFilters()`.
  - New `nyala db:diff [name]`: generates a migration from the diff between your Drizzle models and the last migration, via `drizzle-kit generate` under the hood. Wraps the generated SQL in the existing `up(db)`/`down(db)` migration convention rather than introducing a second format.
  - `nyala generate dto <name>` is now reachable from the CLI (the command existed on `GenerateCommand` but had no `nyala.ts` subcommand wiring it up).
  - Fixed: `nyala generate seeder`/`nyala generate factory` were writing files one directory above the project root instead of into `database/seeders`/`database/factories`, due to a `path.join` normalization bug in how their target directory was computed.
  - `nyala generate factory` now produces a real, faker-wired factory (imports `@faker-js/faker`, calls it in `definition()`) instead of an empty stub — every starter template gained `@faker-js/faker` as a devDependency.
  - Every starter template's `drizzle-orm`/`drizzle-kit` versions bumped to match `@nyalajs/database`'s (`drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`) — they previously pinned an incompatible older major version.

## 2.1.0

### Minor Changes

- b7f965f: Automatic request-correlated logging and `@Optional()` dependency injection.

  - New `LogContext` (`@nyalajs/core`), an `AsyncLocalStorage`-based store mirroring `TenantContext`'s shape and lifecycle. `FastifyAdapter` populates it with `requestId`/`traceId` at the start of every request; `TenantMiddleware` and `AuthGuard` fill in `tenantId`/`userId` as they're learned.
  - `@nyalajs/observability`'s `Logger` now reads `LogContext` automatically on every `debug`/`info`/`warn`/`error` call — every log line for a request is correlated with zero extra code at the call site. Explicit `metadata` passed to a call still wins over `LogContext` on a field collision.
  - New `@Optional()` parameter decorator (`@nyalajs/core`): a constructor dependency marked `@Optional()` resolves to `undefined` instead of throwing "Provider not found" when nothing is registered for its token. Every other, non-`@Optional()` dependency still fails loudly if unwired — this only relaxes the one parameter it's applied to.

## 2.0.1

### Patch Changes

- bd560db: Fix `@UseGuards()`/`@UseInterceptors()` being a silent no-op. `RouteResolver.resolveRoutes()` never read the metadata these decorators write, so every route's `guards`/`interceptors` were always empty regardless of what was declared — `FastifyAdapter` already had correct guard/interceptor execution logic, it just never received anything to execute. Affects every existing template that uses `@UseGuards()`, including `cms-starter`'s own `SessionAuthGuard` on `/admin` routes — those routes were reachable without authentication. `MetadataScanner` gained `getGuards()`/`getInterceptors()` (method-level overrides class-level, matching `@UseGuards()`'s own documented example), now wired into `RouteResolver`.

## 2.0.0

### Major Changes

- # Production-readiness P0 fixes

  Fixes the blockers identified in the production-readiness audit
  (`docs/production-readiness-audit.md`). Several of these are intentional
  breaking changes — see below.

  ## Breaking changes
  - **`@nyalajs/http`**: `FastifyAdapter` now requires `SESSION_SECRET` (min 32
    chars) and `SESSION_SALT` (exactly 16 chars) environment variables
    whenever sessions are enabled (the default) — it previously fell back to a
    hardcoded, publicly-known secret. Set `session: false` to opt out of
    sessions entirely.
  - **`@nyalajs/http`**: Default CORS policy changed from `origin: true,
credentials: true` (reflect any origin, allow credentials) to `origin:
false, credentials: false` (no cross-origin access). Pass the new
    `corsOrigin` adapter option to opt back in to specific origins.
  - **`@nyalajs/database`**: `Model` now enforces tenant scoping for any table
    with a `tenant_id` column. `all()`, `find()`, `save()`, `create()`, and
    `delete()` throw if called with no active tenant context (previously
    silently operated across all tenants). Set the tenant via the new
    `TenantContext` (exported from `@nyalajs/core`) before calling into
    tenant-scoped models.
  - **`@nyalajs/tenancy`**: `TenantMiddleware`'s `use()` signature changed from
    `(ExecutionContext, next)` to `(req, res, next)` to match the `Middleware`
    interface used everywhere else — it was never actually invocable before.
    `HeaderTenantResolver` now returns `undefined` for any request carrying an
    `Authorization` header (tenant must come from the verified JWT on
    authenticated requests, not a client-controlled header). New dependency on
    `@nyalajs/security`.
  - **`@nyalajs/cli`**: `nyala db:migrate`/`db:fresh` no longer use
    drizzle-kit's SQL-file migrator. They now execute the `up(db)`/`down(db)`
    TS stubs `nyala generate migration` produces directly, tracked in a
    `_nyala_migrations` table. Added `nyala db:rollback`. `nyala new`'s
    template resolution is fixed — `mvc` (the default) and `saas` now
    correctly resolve to their real starter templates instead of silently
    falling back to a bare stub.
  - **`@nyalajs/testing`**: `TestingModule.compile()` now actually binds
    decorated controller routes (previously a no-op), so `HttpTestClient`
    requests that previously 404'd unconditionally will now reach real
    handlers.

  ## Other fixes
  - **`@nyalajs/core`**: Fixed the DI container silently rebuilding
    `Scope.SINGLETON` providers on every request-scoped resolution instead of
    sharing one instance; `Scope.REQUEST` now behaves as one-instance-per-request.
    Fixed `ModuleLoader` never registering `controllers` in the DI container,
    which meant `RouteResolver` silently failed to resolve them and no routes
    ever bound for any app.
  - **`@nyalajs/database`**: Added a real transaction API —
    `DatabaseService.transaction()` — with `Model` calls inside it
    transparently participating in the same transaction.
  - **`@nyalajs/tenancy`**: `JwtTenantResolver` now decodes/verifies the bearer
    token itself instead of reading `request.user` (which nothing ever set).

## 1.0.1

### Patch Changes

- acb2696: # Production Release with Starter Templates

  ## New Features

  ### CLI Template System
  - Add `--template` flag to `nyala new` command
  - Support for mvc, saas, and basic templates
  - Interactive template selection
  - Smart file copying with exclusions

  ### MVC Starter Template
  - Complete MVC architecture (Controllers, Models, Services, Repositories)
  - JWT authentication system
  - User management with CRUD operations
  - Request validation with Zod
  - Database migrations and seeders
  - Password hashing utilities
  - Docker and docker-compose support
    -# Breaking Changes

  - CLI now defaults to `mvc` template instead of `basic`
  - Use `--template=basic` for minimal project setup

  ## Migration Guide

  If you're using the old default template:

  ```bash
  # Old behavior
  nyala new my-app  # Creates basic template

  # New behavior
  nyala new my-app  # Creates MVC template
  nyala new my-app --template=basic  # Creates basic template
  ```
