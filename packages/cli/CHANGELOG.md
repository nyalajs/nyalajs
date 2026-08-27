# @nyalajs/cli

## 2.2.1

### Patch Changes

- **Critical fix**: `nyala new --template=mvc/saas/cms/inertia` has never actually worked for any real, published install of this package — confirmed by inspecting the real `npm pack` tarball. Template resolution used `path.join(__dirname, "../../../../templates", folder)`, correct only inside this monorepo's own dev checkout (`packages/cli/dist/commands/` → up 4 → repo root → `templates/`); the published package's `files` field never included the top-level `templates/` directory at all. Every `--template=X` request from a real `npm install @nyalajs/cli` silently fell back to the bare/empty scaffold, with no error or warning that anything had gone wrong.

  Fixed by bundling each starter template's git-tracked files into `packages/cli/runtime/templates/<folder>/` at build time (`scripts/copy-templates.js`, a new `prebuild` step — uses `git ls-files` per template so only real, tracked content ships, not each template's own local `node_modules`/`dist`), with `NewCommand` looking there first and falling back to the monorepo's own `templates/` only for local dev convenience (`npm link` from inside this repo). Verified end to end: packed the CLI with `npm pack`, installed the tarball into a genuinely isolated directory with zero access to this monorepo, and confirmed all 4 real templates (`mvc`/`saas`/`cms`/`inertia`) now correctly produce their real starter content (`auth.controller.ts`, `tenant.model.ts`, admin islands, `resources/js/app.tsx`, respectively) rather than the bare scaffold.

  Also fixed: the bare scaffold's (`--template=basic`) generated `package.json` pinned `@nyalajs/core`/`@nyalajs/http`/`@nyalajs/config` to `^1.0.0` — two major versions behind the real, current `2.x` releases — now `"*"`, matching every real starter template's own convention.

  New regression test suite (`new.command.spec.ts`, 9 tests) exercises every template end-to-end against the actual bundled `runtime/templates/` directory, and asserts no `@nyalajs/*` dependency in a freshly-scaffolded project is ever pinned to a stale `^1.x` range — this exact class of bug can't silently reappear. `NewCommand` also now takes an optional constructor `baseDir` (defaults to `process.cwd()`, unchanged for the real CLI) so these tests don't need `process.chdir()` (unsupported under Vitest's worker-thread pool).

  Also fixed a Turbo cache-correctness gap found while verifying this: `@nyalajs/cli`'s build task had no `inputs` override, so its cache key never included the sibling `templates/` directory — editing a starter template without touching anything under `packages/cli/` could have served a stale cached CLI build missing that change. Added an explicit `@nyalajs/cli#build` task override in `turbo.json`.

## 2.2.0

### Minor Changes

- Type-scoped exception filters, `nyala db:diff`, and CLI generator fixes.

  - New `@Catch(...errorTypes)` and `@UseFilters(...filters)` decorators (`@nyalajs/core`) plus an `ExceptionFilter` interface (`@nyalajs/http`): a pluggable, type-scoped alternative to the single global `ExceptionHandler`. A filter registered via `@Catch(SomeError)` only runs for errors that are `instanceof SomeError`; anything else falls through to the framework's default error handling. Fully additive — no behavior change for routes with no `@UseFilters()`.
  - New `nyala db:diff [name]`: generates a migration from the diff between your Drizzle models and the last migration, via `drizzle-kit generate` under the hood. Wraps the generated SQL in the existing `up(db)`/`down(db)` migration convention rather than introducing a second format.
  - `nyala generate dto <name>` is now reachable from the CLI (the command existed on `GenerateCommand` but had no `nyala.ts` subcommand wiring it up).
  - Fixed: `nyala generate seeder`/`nyala generate factory` were writing files one directory above the project root instead of into `database/seeders`/`database/factories`, due to a `path.join` normalization bug in how their target directory was computed.
  - `nyala generate factory` now produces a real, faker-wired factory (imports `@faker-js/faker`, calls it in `definition()`) instead of an empty stub — every starter template gained `@faker-js/faker` as a devDependency.
  - Every starter template's `drizzle-orm`/`drizzle-kit` versions bumped to match `@nyalajs/database`'s (`drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`) — they previously pinned an incompatible older major version.

### Patch Changes

- Updated dependencies
  - @nyalajs/core@2.2.0

## 2.1.0

### Minor Changes

- Introduce `@nyalajs/inertia`: a real Inertia.js server adapter for NyalaJS. Controllers return page components with props — no separate REST/GraphQL API, no client-side router — the same model as Laravel+Inertia or Rails+Inertia.

  - Full protocol implementation on top of the existing `RenderableResponse` seam: `X-Inertia` JSON/HTML branching, `X-Inertia-Version` mismatch handling (409 + `X-Inertia-Location`), partial reloads (`X-Inertia-Partial-Component`/`Data`/`Except`), request-scoped shared props, and read-once flash messages.
  - Depends on the real `@inertiajs/react`/`@inertiajs/core` packages rather than reimplementing the client protocol.
  - SSR support (`@inertiajs/react/server`) is included but off by default, matching how Laravel's own Inertia starter kits ship it.
  - A dev/production asset-version resolver reads Vite's build manifest, so the 409 stale-asset protocol works against real builds.

  `nyala dev`/`nyala build` gained real Vite integration (a genuine Vite dev server child process in dev, a genuine `vite build` producing `manifest.json` in production) — a no-op for every existing template, following the same pattern already used for esbuild-based islands.

  New starter: `nyala new my-app --template=inertia` scaffolds `templates/inertia-starter` — session auth, a full Posts CRUD resource demonstrating shared props/flash/validation-errors round-tripping to the client, SQLite by default for zero-external-dependency setup, migrations, seeders, and tests.

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
