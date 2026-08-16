# Templates

`nyala new <name> --template=<value>` copies one of four starter templates into your new project directory. This page goes deep on what's actually inside each one's file tree. For the quick side-by-side comparison and environment variable reference, see [Installation → Template Options](../installation#template-options); this page complements that with real directory listings.

Internally, each `--template` value maps to a folder in the framework's own `templates/` directory:

| `--template` value | Template folder | Package name inside |
|---|---|---|
| `mvc` | `templates/basic-starter` | `nyala-mvc-starter` |
| `saas` | `templates/saas-starter` | (set to your project name) |
| `cms` | `templates/cms-starter` | (set to your project name) |
| `inertia` | `templates/inertia-starter` | `nyala-inertia-starter` |
| `basic` | *(none — bare scaffold, no template copied)* | — |

Note the naming: the folder backing `--template=mvc` is called `basic-starter` on disk (its own `package.json` name is `nyala-mvc-starter`) — it's the *full* MVC application with auth and CRUD, not the minimal one. The truly minimal option is `--template=basic`, which doesn't copy a template folder at all; it writes an empty `app/<type>/` scaffold instead (see [Commands → `nyala new`](./commands#nyala-new-name)).

Whichever template is copied, `nyala new` excludes `node_modules/`, `dist/`, `.turbo/`, and `.git` from the copy, and overwrites the `name` field in the copied `package.json` with your project name.

## MVC Starter (`--template=mvc`)

```bash
nyala new blog-api --template=mvc
```

Standard single-tenant MVC application: JWT auth, user CRUD, Docker setup. Real structure:

```
blog-api/
├── app/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── home.controller.ts
│   │   └── users.controller.ts
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   ├── login.dto.ts
│   │   └── update-user.dto.ts
│   ├── helpers/
│   │   └── password.helper.ts
│   ├── models/
│   │   ├── index.ts
│   │   └── user.model.ts
│   ├── repositories/
│   │   ├── base.repository.ts
│   │   └── user.repository.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── users.service.ts
│   └── validators/
│       └── user.validator.ts
├── bootstrap/
│   ├── app.module.ts
│   └── main.ts
├── config/
│   ├── app.ts
│   ├── auth.ts
│   ├── cors.ts
│   ├── database.ts
│   ├── index.ts
│   ├── logging.ts
│   ├── security.ts
│   └── server.ts
├── database/
│   ├── connection.ts
│   ├── migrations/
│   │   └── 0001_create_users_table.ts
│   └── seeders/
│       └── user.seeder.ts
├── docs/
│   └── ARCHITECTURE.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── README.md
└── tsconfig.json
```

**What's in it:**

- `AuthController` + `AuthService` — register, login, refresh, logout against `UserRepository`, with `PasswordHelper` wrapping bcrypt hashing.
- `UsersController` + `UsersService` — full CRUD over users, backed by `UserRepository extends BaseRepository`.
- `HomeController` — a root/health-style controller.
- One migration (`0001_create_users_table.ts`) and one seeder (`user.seeder.ts`), both immediately runnable with `npm run db:migrate` / `npm run db:seed`.
- `docker-compose.yml` + `Dockerfile` for local Postgres and containerized app runs.
- `package.json` wires `db:migrate`, `db:rollback`, `db:fresh`, and `db:seed` to `nyala db:*` directly, plus `test`, `test:unit`, `test:integration`, `test:e2e`, `lint`, and `format`.

**Best for:** standard web applications, APIs, and admin panels — anything single-tenant that needs auth and CRUD out of the box.

## SaaS Starter (`--template=saas`)

```bash
nyala new my-saas --template=saas
```

Everything the MVC starter has, plus multi-tenancy. Real structure:

```
my-saas/
├── app/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── health.controller.ts
│   │   └── users.controller.ts
│   ├── dto/
│   │   ├── create-tenant.dto.ts
│   │   ├── create-user.dto.ts
│   │   ├── login.dto.ts
│   │   └── update-user.dto.ts
│   ├── helpers/
│   │   ├── password.helper.ts
│   │   └── tenant.helper.ts
│   ├── middleware/
│   │   └── logging.middleware.ts
│   ├── models/
│   │   ├── index.ts
│   │   ├── tenant.model.ts
│   │   └── user.model.ts
│   ├── repositories/
│   │   ├── base.repository.ts
│   │   ├── tenant.repository.ts
│   │   └── user.repository.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── users.service.ts
│   └── validators/
│       ├── tenant.validator.ts
│       └── user.validator.ts
├── bootstrap/
│   ├── app.module.ts
│   └── main.ts
├── config/
│   ├── app.ts, auth.ts, cache.ts, cors.ts, database.ts, index.ts,
│   │   logging.ts, mail.ts, middleware.ts, plugins.ts, queue.ts,
│   │   security.ts, server.ts, session.ts, storage.ts
├── database/
│   ├── connection.ts
│   ├── migrations/
│   │   └── 0001_initial.ts
│   └── schema/
│       ├── audit-logs.ts
│       └── index.ts
├── docs/
│   └── MULTI_TENANCY.md
├── routes/
│   └── api.ts
├── k8s/
│   └── deployment.yaml
├── .husky/
│   └── pre-commit
├── Dockerfile
├── .dockerignore
├── .editorconfig
├── .eslintrc.json
├── .prettierrc
├── .env.example
├── package.json
├── README.md
├── tsconfig.json
└── vitest.config.ts
```

**What's in it, beyond the MVC starter's baseline:**

- `TenantModel` + `TenantRepository` + `CreateTenantDto` + `TenantValidator` — tenant CRUD.
- `TenantHelper` — resolves and scopes the current tenant.
- An `audit-logs` schema (`database/schema/audit-logs.ts`) for tracking cross-tenant activity.
- `LoggingMiddleware` for structured request logging.
- A far more complete config surface than the MVC starter: `cache.ts`, `mail.ts`, `middleware.ts`, `plugins.ts`, `queue.ts`, `session.ts`, `storage.ts` are all present here (the MVC starter has only `app`, `auth`, `cors`, `database`, `logging`, `security`, `server`).
- `k8s/deployment.yaml` for a Kubernetes deployment target, in addition to the `Dockerfile`.
- `.husky/pre-commit`, `.eslintrc.json`, `.prettierrc`, `.editorconfig` — a stricter, more opinionated dev-tooling setup than the MVC starter ships.
- `vitest.config.ts` — explicit Vitest configuration (the MVC starter relies on defaults).

**Best for:** SaaS applications, B2B platforms, and multi-customer systems that need tenant isolation and audit trails from day one.

## CMS Starter (`--template=cms`)

```bash
nyala new my-site --template=cms
```

A full-stack site: admin dashboard, CMS, and a server-rendered public site in one app, built on `@nyalajs/react`. Real structure:

```
my-site/
├── app/
│   ├── controllers/
│   │   ├── admin/            # dashboard: pages, posts, categories, tags, media, menus, forms, users
│   │   └── public/           # public-facing blog + pages
│   ├── guards/
│   │   └── session-auth.guard.ts
│   ├── helpers/
│   │   ├── current-user.helper.ts
│   │   └── password.helper.ts
│   ├── islands/
│   │   ├── manifest.ts
│   │   ├── media-uploader.tsx
│   │   └── menu-reorder.tsx
│   ├── models/
│   │   ├── category.model.ts, form-submission.model.ts, index.ts,
│   │   │   media.model.ts, menu-item.model.ts, menu.model.ts,
│   │   │   page.model.ts, post.model.ts, post-tag.model.ts,
│   │   │   setting.model.ts, tag.model.ts, user.model.ts
│   ├── repositories/         # one per model above, plus base.repository.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── layout-data.service.ts
│   ├── validators/
│   │   ├── auth.validator.ts, category.validator.ts, contact.validator.ts,
│   │   │   page.validator.ts, post.validator.ts, tag.validator.ts, user.validator.ts
│   └── views/
│       ├── admin/            # admin dashboard screens (JSX)
│       ├── admin-layout.tsx
│       ├── blocks/           # reusable content blocks
│       ├── layout.tsx
│       └── public/           # public site screens (JSX)
├── bootstrap/
│   ├── app.module.ts
│   └── main.ts
├── config/
│   ├── app.ts, database.ts, index.ts, logging.ts, security.ts,
│   │   server.ts, storage.ts
├── database/
│   ├── connection.ts
│   ├── migrations/           # 10 migrations: users, categories, tags, posts,
│   │                          # post_tags, pages, media, menus+menu_items,
│   │                          # settings, form_submissions
│   └── seeders/               # 6 numbered seeders, e.g. 01-admin-user.seeder.ts
├── public/
│   ├── admin.css
│   ├── site.css
│   ├── islands-manifest.json
│   └── islands/               # pre-bundled island JS output
├── tests/
│   └── smoke.spec.tsx
├── .env.example
├── package.json
├── README.md
└── tsconfig.json
```

**What's in it:**

- **Admin dashboard** (`app/controllers/admin/` + `app/views/admin/`) — pages, posts, categories, tags, media, menus, forms, and user management, guarded by `session-auth.guard.ts`.
- **Public site** (`app/controllers/public/` + `app/views/public/`) — the server-rendered blog and pages, built with `@nyalajs/react` (present in `dependencies`, alongside `react` and `react-dom` — this is the only starter that depends on React).
- **Islands** (`app/islands/`) — `manifest.ts` registers `media-uploader.tsx` and `menu-reorder.tsx` as interactive client-side islands on an otherwise server-rendered page. `nyala dev` and `nyala build` both bundle these automatically into `public/islands/` (see [Commands → `nyala dev`](./commands#nyala-dev) and [`nyala build`](./commands#nyala-build)) — that's why `public/islands-manifest.json` and prebuilt bundles already ship in the template.
- **Ten migrations** covering the full content model: users, categories, tags, posts, post↔tag join table, pages, media, menus + menu items, settings, and form submissions.
- **Six numbered seeders** (`01-admin-user.seeder.ts` through `06-settings.seeder.ts`) that run in order via `nyala db:seed`.
- `package.json`'s `dev` and `build` scripts call `nyala dev` / `nyala build` directly (rather than `tsx watch` / `tsc` like the other two starters), since islands need the CLI's bundling step.

**Best for:** marketing sites, blogs, and small content-driven sites that need an admin dashboard without standing up a separate headless CMS.

## Inertia Starter (`--template=inertia`)

```bash
nyala new my-app --template=inertia
```

A React frontend and a Nyala backend in one app, talking over the real [Inertia.js](https://inertiajs.com) protocol — no separate REST/GraphQL API, no client-side router. A controller returns a page component name plus props (`inertia(req, res, "Posts/Index", { posts })`); the client renders that component with those props. See [`@nyalajs/inertia`](../api/overview) for the package this is built on. Real structure:

```
my-app/
├── app/                        # backend only — no frontend code lives here
│   ├── controllers/
│   │   ├── auth.controller.ts        # register/login/logout, session-based
│   │   ├── dashboard.controller.ts   # real stats from PostsService, not placeholders
│   │   ├── posts.controller.ts       # the one full CRUD resource
│   │   └── settings.controller.ts    # update name, change password
│   ├── dto/
│   │   ├── login.dto.ts, post.dto.ts, register.dto.ts
│   ├── guards/
│   │   └── session-auth.guard.ts
│   ├── helpers/
│   │   ├── current-user.helper.ts, password.helper.ts
│   ├── models/
│   │   ├── index.ts, post.model.ts, user.model.ts
│   ├── repositories/
│   │   ├── base.repository.ts, post.repository.ts, user.repository.ts
│   ├── services/
│   │   ├── auth.service.ts, posts.service.ts
│   └── validators/
│       ├── auth.validator.ts, post.validator.ts, settings.validator.ts
├── resources/js/                # frontend only — separate from app/, matches
│   │                             # Laravel's Inertia starter-kit convention
│   ├── app.tsx                  # client entry — calls createInertiaApp()
│   ├── app.css                  # Tailwind + shadcn/ui CSS-variable theme
│   ├── components/ui/           # shadcn/ui primitives (button, card, table,
│   │                             # dialog, sheet, dropdown-menu, ...)
│   ├── layouts/
│   │   ├── admin-layout.tsx     # sidebar + topbar shell (Dashboard/Posts/Settings)
│   │   ├── nav-items.ts, sidebar-nav.tsx
│   ├── hooks/
│   │   └── use-mobile.ts
│   ├── lib/
│   │   └── utils.ts             # cn() — shadcn's class-merge helper
│   └── pages/
│       ├── Welcome.tsx          # public landing page (the "/" route)
│       ├── Auth/                # Login.tsx, Register.tsx
│       ├── Dashboard/           # Index.tsx
│       ├── Posts/               # Index.tsx, Create.tsx, Edit.tsx
│       └── Settings/            # Index.tsx
├── bootstrap/
│   ├── app.module.ts
│   └── main.ts
├── config/
│   ├── app.ts, database.ts, index.ts, inertia.ts, logging.ts, server.ts
├── database/
│   ├── connection.ts, migrate.ts, seed.ts
│   ├── migrations/              # 0001_create_users_table.ts, 0002_create_posts_table.ts
│   └── seeders/                 # post.seeder.ts, user.seeder.ts
├── tests/
│   └── unit/                    # auth.service, posts.controller, posts.service
├── components.json              # shadcn/ui config (aliases, Tailwind paths)
├── postcss.config.js
├── tailwind.config.ts
├── vite.config.ts
├── vitest.config.ts
├── .env.example
├── package.json
├── README.md
├── tsconfig.json                 # backend — excludes resources/**/*
└── tsconfig.frontend.json        # frontend — includes only resources/js/**/*
```

**What's in it:**

- **The frontend lives in `resources/js/`, not `app/`** — the one starter where this split matters. `app/` is backend-only (controllers, services, models, repositories, guards, validators, dto), matching Laravel's own Inertia starter-kit convention (`app/` = backend, `resources/js/` = frontend). `vite.config.ts`'s `rollupOptions.input` and `config/inertia.ts`'s `entry` both point at `resources/js/app.tsx`.
- **Tailwind + shadcn/ui** (`resources/js/components/ui/`, `tailwind.config.ts`, `components.json`) — real Radix-backed primitives (`button`, `input`, `card`, `table`, `dialog`, `sheet`, `dropdown-menu`, `avatar`, `badge`, `checkbox`, `label`, `separator`, `textarea`, `tooltip`, `skeleton`), styled via `class-variance-authority` and composed with the `cn()` helper in `resources/js/lib/utils.ts`. `@/*` resolves to `resources/js/*` (see `vite.config.ts`'s `resolve.alias` and `tsconfig.frontend.json`'s `paths`).
- **`AdminLayout`** (`resources/js/layouts/admin-layout.tsx`) — a responsive admin dashboard shell: a fixed sidebar on desktop (`lg:` and up) that collapses into a `Sheet` drawer below that breakpoint, plus a sticky topbar with an account dropdown. `Dashboard`, `Posts`, and `Settings` all render through it; `Welcome`, `Auth/Login`, and `Auth/Register` have their own public-page chrome instead.
- **Auth** (`app/controllers/auth.controller.ts`, `app/guards/session-auth.guard.ts`) — register/login/logout via `@fastify/secure-session`, the same session-based approach `cms-starter` uses, not the JWT pattern `mvc`/`saas` use — this is one same-origin, cookie-authenticated app, not a separate API.
- **Dashboard** (`app/controllers/dashboard.controller.ts`, `resources/js/pages/Dashboard/`) — stat cards and a recent-posts list, computed from real `PostsService` data.
- **Posts** (`app/controllers/posts.controller.ts`, `resources/js/pages/Posts/`) — the one full CRUD resource, demonstrating shared props, flash messages, and validation-error round-tripping through Inertia's `props.errors`.
- **Settings** (`app/controllers/settings.controller.ts`, `resources/js/pages/Settings/`) — update display name, change password.
- SQLite by default (`better-sqlite3`, see `config/database.ts`) — this starter ignores `--database`/`DB_DRIVER` entirely; there's no Postgres/MySQL variant of it. `nyala db:migrate`/`db:seed` also don't apply here (the CLI's migration runner is hardcoded to Postgres) — `npm run db:migrate`/`db:seed` instead call `database/migrate.ts`/`database/seed.ts` directly.
- SSR is supported but off by default — see `@nyalajs/inertia`'s own SSR doc comment (`packages/inertia/src/ssr/index.ts`) for wiring up a `resources/js/ssr.tsx` entry and `nyala build --ssr`.

**Best for:** apps that want a full client-side React UI without standing up a separate API — internal tools, dashboards, and CRUD-heavy apps where the backend and frontend ship together.

## Choosing a Template

| If you need... | Use |
|---|---|
| A standard API or web app with auth and user CRUD | `--template=mvc` |
| Multiple tenants with isolated data | `--template=saas` |
| A content site with an admin dashboard and public pages | `--template=cms` |
| A full client-side React UI, no separate API | `--template=inertia` |
| Nothing pre-built — just the folder conventions | `--template=basic` |

`mvc`, `saas`, and `cms` share the same underlying `app/<type>/` convention (`controllers`, `models`, `services`, `repositories`, `validators`, plus template-specific folders like `middleware`, `guards`, `islands`, `views`), so `nyala generate <type> <name>` (see [Generators](./generators)) works identically no matter which of those three you start from — it always writes to `app/<type>/`. `inertia` follows the same `app/<type>/` convention for its *backend* code, but its frontend (`resources/js/pages/`, `resources/js/components/`) lives outside that convention entirely — `nyala generate` doesn't scaffold Inertia page components, only backend artifacts.

## See Also

- [Installation → Template Options](../installation#template-options) — quick comparison and environment variables
- [Commands → `nyala new`](./commands#nyala-new-name) — full flag reference
- [Generators](./generators) — adding artifacts to any of these templates after creation
