# @nyalajs/tenancy

## 2.1.1

### Patch Changes

- Fix `TenantMigrationService`'s auto-provisioned target-database schema (used when migrating a tenant to a dedicated database) to include `DEFAULT gen_random_uuid()` on UUID-shaped primary keys and `DEFAULT NOW()` on `created_at`/`updated_at` columns, matching the column defaults every real migration in this framework's own starter templates already relies on. Without this, `Model.create()` calls that rely on the database to supply these values (the normal, documented pattern — `Model` never generates ids or timestamps client-side) failed outright against a freshly auto-provisioned target with a real Postgres `NOT NULL` violation.

  Also documents (via `@nyalajs/database`'s companion changeset) that the shared-database token tables a real app typically keeps outside tenant scoping (refresh tokens, verification tokens, etc.) need their foreign keys to `users(id)` dropped once dedicated-per-tenant databases are in use — a user's row may no longer live in the same physical database as those tables, making a same-database foreign key structurally invalid. This is an application-level migration concern, not a framework change; see `templates/saas-starter`'s own migration for a worked example.

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @nyalajs/core@2.3.2
  - @nyalajs/database@2.2.1
  - @nyalajs/http@2.3.1

## 2.1.0

### Minor Changes

- Add dedicated-database-per-tenant support, live migration between shared and dedicated isolation, and a real tenant registry — the "shared DB with row-level isolation" model this package already had is now one of two supported isolation modes, switchable per tenant at runtime with no redeploy.

  - New `TenantRecord` (a `@nyalajs/database` `Model`, lives in the shared/system database) + `TenantRegistry` — the source of truth for which tenants exist, whether each is `"shared"` or `"dedicated"`, and (for dedicated tenants) their own connection string. Backed by a short-TTL in-process cache that's invalidated immediately on every write, so a migration's cutover is visible on the very next request.
  - New `TenantConnectionManager` — a real, pooled registry of live dedicated-tenant connections: lazily opens one on first use (reusing `@nyalajs/database`'s new `openConnection()`), reuses it for every later request from that tenant, deduplicates concurrent cold-open races, evicts by LRU under a configurable connection cap, and sweeps idle connections on a timer.
  - `TenantMiddleware` now optionally takes a `TenantRegistry` + `TenantConnectionManager` (both `@Optional()` — fully backward compatible with existing wiring that doesn't pass them). When present, it looks up the resolved tenant's isolation mode after resolving the tenant id: a `"dedicated"` tenant's connection is fetched/opened and the rest of the request runs inside `@nyalajs/database`'s `ConnectionContext.run()`, so every `Model` call in the handler transparently targets that tenant's own database — no repository/handler code has to know or care which mode a given tenant is in. A `"shared"` tenant (or no registry configured) behaves exactly as before.
  - New `TenantMigrationService` — moves one tenant's data between shared and dedicated storage live: `migrateToDedicated()` provisions the target schema (auto-`CREATE TABLE` from the same Model definitions, or skip and bring your own pre-migrated target), copies every listed table's rows in batches (tenant-scoped reads, tenant-scoped upsert writes — reuses `Model`/`TenantContext`'s existing scoping machinery rather than hand-building `WHERE`/stamping logic), verifies row counts match on both sides, and only then flips the tenant's registry entry — the atomic cutover. `migrateToShared()` reverses it. Source data is never deleted by this service. A tenant migrated back a second time (or one whose prior source rows were never cleaned up) upserts on id collision rather than throwing a duplicate-key error, with the side being migrated FROM treated as authoritative.
  - A dedicated tenant's database uses the exact same `Model` classes/schema as the shared database — `tenant_id` column included — so `Model` itself stays completely unaware of isolation mode; nothing about how you write a Model or a repository changes based on how a given tenant happens to be isolated today.
  - Verified against real, unmocked infrastructure throughout: real separate SQLite database files standing in for "shared" and "dedicated" (including a genuine concurrency test proving `AsyncLocalStorage`-based routing, not a shared mutable flag, is what keeps two tenants' connections from crossing), plus real-Postgres-gated and real-MySQL-gated integration suites (`POSTGRES_TEST_URL`/`MYSQL_TEST_URL`, same convention as `@nyalajs/database`'s own driver tests) exercising the identical migration flow against two real databases on each server. Works against every dialect `@nyalajs/database` supports — Postgres (`pg` or `postgres` driver), MySQL (`mysql2`), and SQLite (`better-sqlite3`) — since `TenantConnectionManager`/`TenantMigrationService` are built entirely on `openConnection()`/`Model`, never a Postgres-specific code path.

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
