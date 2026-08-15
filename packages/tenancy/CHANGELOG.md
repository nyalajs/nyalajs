# @nyalajs/tenancy

## 2.0.1

### Patch Changes

- b7f965f: Automatic request-correlated logging and `@Optional()` dependency injection.

  - New `LogContext` (`@nyalajs/core`), an `AsyncLocalStorage`-based store mirroring `TenantContext`'s shape and lifecycle. `FastifyAdapter` populates it with `requestId`/`traceId` at the start of every request; `TenantMiddleware` and `AuthGuard` fill in `tenantId`/`userId` as they're learned.
  - `@nyalajs/observability`'s `Logger` now reads `LogContext` automatically on every `debug`/`info`/`warn`/`error` call — every log line for a request is correlated with zero extra code at the call site. Explicit `metadata` passed to a call still wins over `LogContext` on a field collision.
  - New `@Optional()` parameter decorator (`@nyalajs/core`): a constructor dependency marked `@Optional()` resolves to `undefined` instead of throwing "Provider not found" when nothing is registered for its token. Every other, non-`@Optional()` dependency still fails loudly if unwired — this only relaxes the one parameter it's applied to.

- Updated dependencies [b7f965f]
  - @nyalajs/core@2.1.0
  - @nyalajs/http@2.1.0
  - @nyalajs/security@1.0.1

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
