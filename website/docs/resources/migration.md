# Migration Guide

How Nyala is versioned, and what to check when upgrading between versions. This page is grounded in the actual release history in the repository — each package's own `CHANGELOG.md` under `packages/<name>/CHANGELOG.md` is the source of truth; this is a curated summary.

## How versioning works in this monorepo

Nyala is a monorepo (npm workspaces: `packages/*` and `templates/*`) managed with [Changesets](https://github.com/changesets/changesets). That has one important consequence: **packages are versioned independently, not lockstepped.** There is no single "Nyala version" — `@nyalajs/core` being at `2.0.0` doesn't mean `@nyalajs/mail` is also at `2.0.0`.

As of this writing, current package versions look like this:

| Package | Version |
|---|---|
| `@nyalajs/core` | 2.0.0 |
| `@nyalajs/http` | 2.0.0 |
| `@nyalajs/database` | 2.0.0 |
| `@nyalajs/tenancy` | 2.0.0 |
| `@nyalajs/cli` | 2.0.0 |
| `@nyalajs/testing` | 2.0.0 |
| `@nyalajs/config` | 1.0.1 |
| `@nyalajs/security`, `@nyalajs/audit`, `@nyalajs/observability`, `@nyalajs/cache`, `@nyalajs/queue`, `@nyalajs/scheduler`, `@nyalajs/events`, `@nyalajs/mail`, `@nyalajs/notifications`, `@nyalajs/storage`, `@nyalajs/validation`, `@nyalajs/react` | 1.0.0 |

The six packages at `2.0.0` were bumped together because they consumed one shared changeset — a "production-readiness P0 fixes" release — which is why they moved in lockstep while everything else stayed put. Don't assume every future major bump will be that broad; check each package's own changelog before upgrading it.

Standard SemVer rules apply per package: patch (`x.x.N`) is safe to take automatically, minor (`x.N.x`) adds functionality without breaking existing code, major (`N.x.x`) may contain breaking changes and should be read before upgrading.

> Note: the top-level `CHANGELOG.md` at the repository root documents the `1.0.0` monorepo release in detail but hasn't been updated with the `2.0.0` breaking changes described below — those currently live only in the individual packages' changelogs (`packages/core/CHANGELOG.md`, `packages/http/CHANGELOG.md`, etc.) and in the release commit itself. If you want the authoritative breaking-change list for a specific package, read that package's `CHANGELOG.md` directly.

## Checking what you actually have installed

Before assuming you're affected by a given change, check what's installed in your project rather than trusting the table above — it reflects the versions in this repository at time of writing, and your `node_modules` may be pinned to something older:

```bash
# Single package
npm ls @nyalajs/core

# Everything from the scope at once
npm ls | grep @nyalajs
```

Or read the installed `package.json` directly:

```bash
node -p "require('@nyalajs/core/package.json').version"
```

## Upgrading to 2.0.0 (core, http, database, tenancy, cli, testing)

This release fixed a set of production-readiness issues found in an internal audit. Several fixes are **intentional breaking changes** — read all of these before upgrading, even if you think a given area doesn't apply to you, since some (like the CORS default) affect every app.

### `@nyalajs/http`: sessions now require explicit secrets

`FastifyAdapter` now requires `SESSION_SECRET` (minimum 32 characters) and `SESSION_SALT` (exactly 16 characters) environment variables whenever sessions are enabled, which is the default. Previously, a missing secret silently fell back to a hardcoded, publicly-known value — a real security hole in any app that didn't set one.

**What to do:** Add both variables to your production and local `.env` files:

```env
SESSION_SECRET=replace-with-a-random-string-of-32-or-more-characters
SESSION_SALT=exactly16chars!!
```

Or pass `session: false` to the adapter if your app doesn't use sessions at all:

```ts
new FastifyAdapter(container, {
  session: false,
});
```

### `@nyalajs/http`: CORS is closed by default

The default CORS policy changed from `origin: true, credentials: true` (reflect any origin, allow credentials — effectively open to any site) to `origin: false, credentials: false` (no cross-origin access).

**What to do:** If your app is called from a browser on a different origin, pass the new `corsOrigin` adapter option with your real allowed origin(s) after upgrading, or requests from your frontend will start failing.

### `@nyalajs/database`: tenant scoping is now enforced

`Model` now enforces tenant scoping for any table with a `tenant_id` column. `all()`, `find()`, `save()`, `create()`, and `delete()` throw if called with no active tenant context. Previously, these silently operated across every tenant — a correctness and data-isolation bug for any multi-tenant app.

**What to do:** Set the tenant via the new `TenantContext` (exported from `@nyalajs/core`) before calling into tenant-scoped models:

```ts
import { TenantContext } from '@nyalajs/core';

TenantContext.run(() => {
  TenantContext.set(tenantId);
  // any Model calls against a tenant_id-scoped table from here on
  // are scoped to `tenantId` — calling them outside a run()/set()
  // pair with no tenant set is what now throws.
});
```

In practice, confirm your tenant-resolution middleware runs before any code path that touches a tenant-scoped model — request-scoped code that used to work by accident may now throw.

This release also added a real transaction API, `DatabaseService.transaction()`, with `Model` calls inside it participating in the same transaction — not a breaking change, but worth adopting if you were previously working around the lack of one.

### `@nyalajs/tenancy`: middleware signature and header trust changed

- `TenantMiddleware`'s `use()` signature changed from `(ExecutionContext, next)` to `(req, res, next)`, matching the `Middleware` interface used everywhere else in the framework. (The old signature meant this middleware was never actually invocable — so if your app somehow relied on the old signature, it was already non-functional.)
- `HeaderTenantResolver` now returns `undefined` for any request carrying an `Authorization` header — the tenant must come from the verified JWT on authenticated requests, not a client-controlled header, closing a spoofing gap.
- `JwtTenantResolver` now decodes/verifies the bearer token itself instead of reading `request.user` (which nothing previously set).
- New dependency on `@nyalajs/security`.

**What to do:** If you have custom tenant middleware or resolvers, review them against the new signature:

```ts
// Before (2.0.0 and earlier custom middleware following the old shape)
use(context: ExecutionContext, next: () => void) { /* ... */ }

// After — matches the `Middleware` interface: use(req, res, next)
async use(req: any, res: any, next: () => void) { /* ... */ }
```

If you were relying on the `X-Tenant-ID` header for authenticated requests, switch to JWT-based tenant resolution — the header resolver will no longer see it once an `Authorization` header is present.

### `@nyalajs/cli`: migrations run differently

- `nyala db:migrate` / `nyala db:fresh` no longer use drizzle-kit's SQL-file migrator. They now execute the `up(db)`/`down(db)` TypeScript stubs that `nyala generate migration` produces, tracked in a `_nyala_migrations` table.
- New command: `nyala db:rollback`.
- `nyala new`'s template resolution was fixed — `mvc` (the default) and `saas` now correctly resolve to their real starter templates instead of silently falling back to a bare stub. If you were on an affected version, projects you created may have been thinner than intended.

**What to do:** Port any existing `.sql` migration files to the `up(db)`/`down(db)` TypeScript format. Re-run `nyala generate migration <name>` to see the expected shape.

### `@nyalajs/testing`: test client now actually works

`TestingModule.compile()` now actually binds decorated controller routes — previously this was a no-op, so `HttpTestClient` requests would 404 unconditionally regardless of your routes.

**What to do:** If you have integration tests that were asserting on 404s because that's "just what happened," they'll need to be revisited — they'll now exercise real handlers.

### Also fixed in this release (not breaking, but worth knowing)

- `@nyalajs/core`: the DI container was silently rebuilding `Scope.SINGLETON` providers on every request-scoped resolution instead of sharing one instance; `Scope.REQUEST` now correctly behaves as one-instance-per-request.
- `@nyalajs/core`: `ModuleLoader` was never registering `controllers` in the DI container, meaning `RouteResolver` silently failed to resolve them — no routes bound for any app. If you're upgrading from a pre-2.0.0 version where routes mysteriously didn't bind, this was likely why.

## Upgrading to 1.1.0 (`@nyalajs/cli`)

Earlier history, for reference if you're upgrading from a very old install:

- `nyala new` gained a `--template` flag (`mvc`, `saas`, `basic`) and interactive template selection.
- **Breaking:** the CLI's default template changed from `basic` to `mvc`. If your scripts or CI relied on `nyala new my-app` producing a bare scaffold, add `--template=basic` explicitly:

```bash
# Old behavior
nyala new my-app              # created the basic (bare) scaffold

# New behavior
nyala new my-app               # creates the mvc (full) scaffold
nyala new my-app --template=basic   # explicitly opt into the bare scaffold
```

## Ancient history: the `@nyala` → `@nyalajs` scope rename

If you're looking at documentation, a fork, or install instructions that reference packages under the `@nyala/*` npm scope (e.g. `@nyala/core`) instead of `@nyalajs/*`, that's from before the project renamed its npm scope early in its history. Every current package publishes under `@nyalajs/*` — there is no supported `@nyala/*` package to install.

## General upgrade checklist

Before bumping any Nyala package to a new major version:

1. Read that package's `CHANGELOG.md` under `packages/<name>/CHANGELOG.md` in the repository — this page summarizes the highlights but isn't exhaustive.
2. Upgrade in a branch, not directly on `main` — some of the 2.0.0 changes (session secrets, CORS) will make an app fail to start or reject requests until configuration is updated, not just fail quietly.
3. Check your `.env` against the current [Installation](../installation#environment-configuration) environment variable list — new required variables (like `SESSION_SECRET`/`SESSION_SALT`) won't show up as TypeScript errors, only as runtime failures.
4. If you use multi-tenancy, re-test every code path that touches a tenant-scoped model after upgrading `@nyalajs/database` or `@nyalajs/tenancy` — the tenant-context enforcement changes are easy to miss until a request throws in production.
5. Re-run your test suite with `@nyalajs/testing@2.0.0` or later before trusting integration test results — earlier versions silently didn't exercise real routes at all.

## Getting help with an upgrade

If you hit a specific error after upgrading, check [Troubleshooting](./troubleshooting) first — most of the common post-upgrade failures (missing `SESSION_SECRET`, CORS rejections, "no active tenant context" errors, old-format migrations) are documented there with the exact fix. Otherwise, open an issue on [GitHub](https://github.com/nyalajs/nyalajs/issues).
