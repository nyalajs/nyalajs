# @nyalajs/testing

## 2.0.1

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

- Updated dependencies
  - @nyalajs/http@2.3.0
  - @nyalajs/core@2.3.1

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

### Patch Changes

- Updated dependencies
  - @nyalajs/core@2.0.0
  - @nyalajs/http@2.0.0
