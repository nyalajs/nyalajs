# Frequently Asked Questions

Answers to the questions that come up most often when people start with Nyala. If something isn't covered here, check [Troubleshooting](./troubleshooting) for setup problems, or open a [GitHub Discussion](https://github.com/nyalajs/nyalajs/discussions).

## General

### What is Nyala?

Nyala is an enterprise-grade TypeScript framework for building production-ready backend applications. It provides a complete MVC architecture (Controllers, Services, Repositories, Models, DTOs, Validators), built-in JWT authentication, native multi-tenancy, and a CLI that scaffolds full starter applications rather than bare boilerplate. See the [Introduction](../introduction) for the full pitch.

### Is Nyala stable enough to use in production?

The core packages (`@nyalajs/core`, `@nyalajs/http`, `@nyalajs/database`, `@nyalajs/tenancy`, `@nyalajs/cli`, `@nyalajs/testing`) are currently at major version `2.0.0`. That 2.0.0 release specifically closed out a set of "production-readiness" P0 issues — insecure session defaults, an open CORS policy, and multi-tenant queries that weren't actually tenant-scoped — so it's a meaningful signal of hardening, not just a version bump. That said, this is a young framework with a small maintainer surface area; read the [Migration Guide](./migration) before upgrading, and pin exact versions in your `package.json` rather than trusting broad `^` ranges across a major bump.

### Does Nyala feel like NestJS or Laravel?

There's no official comparison published in the docs, but the resemblance is intentional in spirit if you've used either: like NestJS, Nyala uses decorators (`@Controller`, `@Injectable`, `@Module`) and a constructor-based dependency injection container; like Laravel, it leans on "convention over configuration" with an opinionated `app/controllers`, `app/services`, `app/repositories` structure and CLI generators for scaffolding. If you know either framework, Nyala's [Architecture Overview](../concepts/architecture) and [Dependency Injection](../concepts/dependency-injection) pages will feel familiar.

### What license is Nyala released under?

MIT. See the [LICENSE](https://github.com/nyalajs/nyalajs/blob/main/LICENSE) file in the repository root. You can use, modify, and redistribute it, including in closed-source commercial projects, with no obligation beyond keeping the copyright notice.

### Who maintains Nyala?

It's maintained by [Hailemariyam](https://github.com/Hailemariyam) as the primary author, with contributions accepted via the process in [Contributing](./contributing).

## Templates

### Which starter template should I use — mvc, saas, cms, inertia, or basic?

- **`mvc`** (the default) — a standard application with JWT auth, user CRUD, migrations, and Docker. Use this unless you specifically need multi-tenancy, a CMS, or a client-side React UI.
- **`saas`** — everything in `mvc` plus multi-tenancy, tenant management, and cross-tenant protection. Use this if you're building a product with multiple customer organizations sharing one deployment.
- **`cms`** — an admin dashboard, content management (pages, blog, media, menus, forms), and a server-rendered public site built on `@nyalajs/react`, with session-based auth instead of JWT. Use this for marketing sites, blogs, or content-driven sites that need an admin panel.
- **`inertia`** — a React frontend and a Nyala backend in one app over the real [Inertia.js](https://inertiajs.com) protocol (no separate REST API), with a Tailwind + shadcn/ui admin dashboard already wired up. Use this for internal tools or CRUD-heavy apps that want a full client-side React UI without standing up a separate API.
- **`basic`** — no starter template at all, just the bare `app/`, `database/`, `config/` folder scaffold with no auth, no CRUD, and stub config files. Use this only if you're deliberately building from scratch and don't want any of the above opinions.

Full details are on the [Installation](../installation#template-options) page.

### What's actually different between `basic` and the other templates?

More than "less code." `basic` isn't a trimmed-down `mvc` — it's a separate, minimal scaffold. Its generated `config/database.ts` even ships with the comment `// No ORM/database adapter ships yet`, because the bare scaffold reserves the config shape without wiring up a real driver. If you want a working authenticated app out of the box, start from `mvc`, `saas`, `cms`, or `inertia`, not `basic`.

### Can I switch templates after creating a project?

Not automatically — there's no `nyala convert` command. `nyala new` picks a template once at project creation and copies its files in. If you started on `basic` and want `mvc`'s auth and CRUD scaffolding, the practical path is to create a second project with `nyala new --template=mvc` and port your code over, or manually add the pieces (controllers, services, JWT setup) by hand.

### Can I mix templates, e.g., add multi-tenancy to an `mvc` project later?

There's no supported "add multi-tenancy" migration path today. The `saas` template wires up `@nyalajs/tenancy` (tenant resolution middleware, tenant-scoped models, tenant context) from the start; retrofitting that onto an `mvc` project means manually installing `@nyalajs/tenancy` and following the same wiring the `saas` template does, but it isn't a one-command operation.

## Architecture & Core Concepts

### How does dependency injection work?

Mark a class `@Injectable()`, declare its dependencies as constructor parameters, and register it as a `provider` on a `@Module()` — the DI container resolves and injects the instance automatically at runtime, based on TypeScript's `reflect-metadata`-driven constructor types. See [Dependency Injection](../concepts/dependency-injection) for the full walkthrough, including scopes (singleton, request, transient).

### What does "convention over configuration" actually mean here?

Concretely: `nyala new` generates a fixed `app/{controllers,services,repositories,models,dto,validators,...}` folder layout, and `nyala generate` commands scaffold new files into the matching folder with the matching naming pattern (e.g. `posts.controller.ts`, `posts.service.ts`). You're expected to follow that structure rather than invent your own; in exchange, you get consistent generators and less configuration to write by hand.

### What HTTP server does Nyala run on under the hood?

Fastify, via `@nyalajs/http`'s `FastifyAdapter`. Nyala's own decorators and routing sit on top of it, but request/response objects and things like file uploads still surface some Fastify- and Express-flavored types (e.g. `Express.Multer.File` for uploads) in a few spots.

### Does Nyala validate requests for me?

Yes, via `@nyalajs/validation`, which wraps [Zod](https://zod.dev/). You define a Zod schema as a validator and attach it to a route with `@UseValidation()` / `@ValidateBody()`; invalid payloads are rejected before your handler runs. See [Validation](../features/validation).

### What security middleware is enabled by default?

`@nyalajs/http`'s `FastifyAdapter` registers Helmet (`@fastify/helmet`), rate limiting (`@fastify/rate-limit`), and CSRF protection (`@fastify/csrf-protection`) by default — all three can be turned off per-option (`helmet: false`, `rateLimit: false`, `csrf: false`) if you have a reason to. CORS, by contrast, defaults to fully closed (see the [Migration Guide](./migration#nyalajshttp-cors-is-closed-by-default)) rather than being on with a permissive default — you opt in with `corsOrigin`, you don't opt out of it.

### What does `@nyalajs/react` do, and is it only for the CMS template?

`@nyalajs/react` provides server-rendered React views with opt-in "islands" for client-side interactivity, described in its own `package.json` as "Server-rendered React views for NyalaJS, with opt-in islands for client interactivity." The `cms` template is currently the one built on it — its public site and a couple of admin screens (media upload, menu reordering) use islands — but the package itself isn't hard-wired to that template; see the [CMS Starter](../installation#cms-starter) template description for what it looks like in practice.

## Database

### Which databases does Nyala actually support?

As of `@nyalajs/database@2.0.0`, only **PostgreSQL**, via [Drizzle ORM](https://orm.drizzle.team/)'s `node-postgres` driver. The package's `DatabaseService`, `Model`, and transaction APIs are all built directly against `NodePgDatabase`.

### `nyala new` asked me to pick MySQL or SQLite — does that work?

Not currently, in the templates that wire up `@nyalajs/database` (`mvc`/`saas`/`cms`). The `--database` / interactive database prompt exists in the CLI and gets written into a `DB_DRIVER` environment variable in generated config, but `@nyalajs/database` only implements a Postgres driver — the `mysql`/`sqlite` choices don't produce a working MySQL or SQLite connection there. Pick PostgreSQL (the recommended default) unless you're prepared to write your own driver integration. This is also covered in [Troubleshooting](./troubleshooting#i-selected-mysql-or-sqlite-in-nyala-new-and-nothing-connects).

The `inertia` template is a separate case: its actual database connection (`database/connection.ts`) talks to SQLite directly via `better-sqlite3` and Drizzle's own `drizzle-orm/better-sqlite3` — no `DatabaseService`/`Model` from `@nyalajs/database` anywhere in that path, even though the package still appears in its `package.json` (unused there). The `--database` prompt/flag is ignored for it entirely; it's SQLite-only regardless of what you pass.

### How do migrations work?

As of CLI `2.0.0`, `nyala generate migration` produces a TypeScript file with `up(db)` / `down(db)` functions, and `nyala db:migrate` executes those functions directly, tracking what's been applied in a `_nyala_migrations` table. This replaced an earlier drizzle-kit SQL-file-based migrator. There's also `nyala db:rollback` (new in 2.0.0) and `nyala db:fresh`. See the [Migration Guide](./migration) if you have migrations written for an older CLI version.

### Do repositories automatically filter by tenant?

Only in tenant-aware models. As of `@nyalajs/database@2.0.0`, any `Model` backed by a table with a `tenant_id` column enforces tenant scoping — `all()`, `find()`, `save()`, `create()`, and `delete()` will throw if there's no active tenant context, rather than silently querying across every tenant like earlier versions did. Set the tenant via `TenantContext` (exported from `@nyalajs/core`) before calling into tenant-scoped models. Non-tenant tables are unaffected.

## Multi-Tenancy

### Do I need the `saas` template to use multi-tenancy?

You need `@nyalajs/tenancy` installed and wired up (tenant middleware, a tenant resolver, tenant-scoped models), which the `saas` template does for you out of the box. Nothing stops you from adding `@nyalajs/tenancy` to a hand-rolled project, but you'd be replicating what `saas` already sets up. See [Multi-Tenancy Overview](../multi-tenancy/overview).

### How is the current tenant determined on a request?

`@nyalajs/tenancy` ships resolvers for subdomain-, header-, and JWT-based tenant resolution. As of `2.0.0`, `HeaderTenantResolver` explicitly ignores the tenant header on any request that also carries an `Authorization` header — on authenticated requests, the tenant must come from the verified JWT, not a client-supplied header, since a client could otherwise spoof `X-Tenant-ID` to reach another tenant's data.

## Security & Auth

### Is authentication JWT-based or session-based?

Depends on the template. `mvc` and `saas` use JWT authentication (access + refresh tokens) via `@nyalajs/security`. `cms` and `inertia` both use session-based authentication (`@fastify/secure-session`) instead — it fits their same-origin, cookie-authenticated model better than stateless JWTs, since neither ships a separate API consumed cross-origin.

### Do I need to set `JWT_SECRET`?

Yes, for `mvc`/`saas` — it's read from the environment and used to sign/verify tokens. There's a placeholder default in generated config, but treat that as "your app is broken and insecure until you change it," not a working default. See [Troubleshooting](./troubleshooting) for the failure modes when it's missing or weak.

### What about `SESSION_SECRET` and `SESSION_SALT`?

These became required as of `@nyalajs/http@2.0.0` whenever sessions are enabled (the default for `FastifyAdapter`). `SESSION_SECRET` must be at least 32 characters and `SESSION_SALT` exactly 16 characters, or the app throws on startup — this replaced a previous fallback to a hardcoded, publicly-known secret. If you don't need sessions, pass `session: false` to opt out entirely. See the [Migration Guide](./migration).

### Is CORS open by default?

No, as of `2.0.0`. It used to default to `origin: true, credentials: true` (reflect any origin, allow credentials) — effectively wide open. It now defaults to `origin: false, credentials: false`. Pass the `corsOrigin` adapter option with your actual allowed origin(s) to opt back in.

## CLI & Tooling

### Can I install and use individual `@nyalajs/*` packages without the CLI?

Yes — every package (`@nyalajs/core`, `@nyalajs/http`, `@nyalajs/validation`, etc.) is published independently on [npm](https://www.npmjs.com/org/nyalajs) and can be installed directly with `npm install @nyalajs/core`. The CLI (`nyala new`) is a convenience for scaffolding a full app; it's not a requirement for using the underlying packages in an existing project.

### What Node.js version do I need?

Node.js 18 or higher, and npm 9 or higher — this is enforced by the `engines` field in the repository's root `package.json`. See [Troubleshooting](./troubleshooting#node-version-mismatch) if you're on an older version.

### Where do generated files go, and can I customize the generators?

`nyala generate <type> <name>` writes into the matching `app/` subfolder using the project's naming convention (see [CLI Generators](../cli/generators)). There isn't a documented mechanism for customizing generator templates today — they follow the framework's fixed conventions.

## Versioning & Community

### Why are some packages at `1.0.0` and others at `2.0.0`?

Nyala's packages are versioned independently via [Changesets](https://github.com/changesets/changesets), not lockstepped. `@nyalajs/core`, `@nyalajs/http`, `@nyalajs/database`, `@nyalajs/tenancy`, `@nyalajs/cli`, and `@nyalajs/testing` were bumped to `2.0.0` together because they shared one breaking changeset (the production-readiness fixes). Packages that weren't touched by that changeset — `@nyalajs/security`, `@nyalajs/audit`, `@nyalajs/cache`, and others — are still at `1.0.0`/`1.0.1`. See the [Migration Guide](./migration) for the full breakdown.

### How do I report a bug or request a feature?

Open an issue on [GitHub](https://github.com/nyalajs/nyalajs/issues). For open-ended questions, use [GitHub Discussions](https://github.com/nyalajs/nyalajs/discussions) rather than issues.

### How do I contribute?

See the dedicated [Contributing](./contributing) page, which summarizes the repository's `CONTRIBUTING.md` — development setup, branch/PR workflow, testing requirements, and commit conventions.
