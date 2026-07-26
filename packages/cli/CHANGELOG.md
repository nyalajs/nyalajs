# @nyalajs/cli

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

## 1.1.1

### Patch Changes

- Fix `nyala --version` and the startup banner printing a hardcoded `0.1.0` instead of the actual installed CLI version. Both now read the version from the package's own `package.json` at runtime, so they can't drift out of sync with future releases again.

## 1.1.0

### Minor Changes

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

### Patch Changes

- Fix `nyala new` (basic template) generating a `package.json` that pinned `@nyalajs/core`, `@nyalajs/http`, and `@nyalajs/config` to `^0.1.0`, a version line that was never published (the packages are published at `1.0.0`). This caused `npm install` to fail with `ETARGET`, which in turn left `ts-node` uninstalled and `npm run dev` failing with `ts-node: not found`.

  - Bump generated dependency ranges to `^1.0.0`
  - Switch the generated `dev` script from `ts-node bootstrap/main.ts` to `tsx watch bootstrap/main.ts`, matching the `basic-starter`/`saas-starter` templates

- Updated dependencies [acb2696]
  - @nyalajs/core@1.0.1
