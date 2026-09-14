# @nyalajs/database

## 2.2.1

### Patch Changes

- Add `dbName`/`nullable` overrides to every column convenience decorator (`StringColumn`, `IntColumn`, `TimestampColumn`, `BooleanColumn`), plus a new `JsonColumn` decorator. Previously these always used the JS property name verbatim as the DB column name and always emitted `NOT NULL` — silently wrong against any real snake_case migration (a decorated `isActive` property produced SQL for a column literally named `isActive`, not `is_active`) or any genuinely-nullable column. Confirmed via a real Postgres insert: a `Model` built without these overrides against a real snake_case table failed with `column "isActive" of relation "..." does not exist`.

  ```ts
  @StringColumn(255, { dbName: "is_active", nullable: true })
  isActive?: boolean | null;
  ```

- Updated dependencies
  - @nyalajs/core@2.3.2

## 2.2.0

### Minor Changes

- Add `ConnectionContext` — the connection-routing primitive dedicated-per-tenant databases need, plus a real bug fix in the existing multi-connection path.

  - New `ConnectionContext` (`AsyncLocalStorage`-based, mirrors `TransactionContext`'s exact shape/lifecycle): lets request-scoped code point every `Model` call at a specific connection instead of the global default, with zero call-site changes. `Model.connection()`'s resolution order is now: active transaction → active `ConnectionContext` → the global pool. This is the mechanism `@nyalajs/tenancy`'s dedicated-per-tenant-database support is built on, but it's independently useful anywhere a request needs to run against a non-default connection.
  - New `openConnection()` — the same real, 4-driver (`pg`/`postgres`/`mysql2`/`better-sqlite3`) connection-opening logic `DatabaseService.connect()` already had, extracted into a standalone function that returns a plain, disposable `{ db, dialect, close }` instead of mutating process-global state. `DatabaseService.connect()` is now a thin wrapper around it. Useful for opening any number of additional, independently-managed connections (e.g. one per dedicated tenant) without them fighting over `SchemaRegistry`'s single process-wide dialect.
  - New `execRaw()` — the cross-dialect raw-query-result-shape detection previously private to `RelationLoader`'s pivot-table queries, extracted so other code (e.g. schema-provisioning in `@nyalajs/tenancy`) can run a raw query and get back a plain row array regardless of driver.
  - **Bug fix**: `QueryBuilder` (`Model.query()...get()`) had its own private copy of connection resolution that had drifted out of sync with `Model`'s — it never consulted `ConnectionContext` even before this release's changes reached it, meaning `Model.query()` results could silently come from the wrong connection in any multi-connection scenario while `Model.all()`/`Model.find()` behaved correctly. Fixed to share the same resolution order as `Model` itself.

## 2.1.0

### Minor Changes

- Add ORM relations and a fluent query builder to `Model`.

  - `@HasMany()`, `@HasOne()`, `@BelongsTo()`, `@BelongsToMany()` relation decorators — declared on model properties with a thunk (`() => RelatedModel`) so two models can reference each other without an import-order cycle.
  - `Model.query()` — a fluent `QueryBuilder`: `.where()`, `.whereIn()`, `.whereNull()`/`.whereNotNull()`, `.orderBy()`, `.limit()`/`.offset()`, `.with()` for eager loading, `.get()`/`.first()`.
  - Eager loading (`Model.all({ with: [...] })`, `Model.find(id, { with: [...] })`, or `.query().with(...)`) always batches into one extra query per relation across the whole result set — never one query per parent row.
  - `instance.load(relationName)` for lazy-loading a relation on demand.
  - Eager-loaded relations are tenant-scoped the same way the main query already is — a tenant-scoped parent's relation only ever loads that tenant's related rows, even when a related row under a different tenant shares the same foreign key value.
  - `belongsToMany` reads the pivot table via a parameterized raw query (it has no `@Table()`-backed Model of its own), with result-shape detection that's correct across all four supported drivers (better-sqlite3, node-postgres, postgres-js, mysql2) — each returns a differently-shaped result from a raw query, verified against live instances of all four, not assumed from types.

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

- Updated dependencies [acb2696]
  - @nyalajs/core@1.0.1
