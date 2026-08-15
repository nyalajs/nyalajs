# Nyala Inertia Starter

A React frontend and a NyalaJS backend, in one app, talking to each other
via the real [Inertia.js](https://inertiajs.com) protocol — no separate
REST/GraphQL API, no client-side router, no data-fetching library. A
controller returns a page component name plus props; the client renders
that component with those props. This is the same model as
Laravel+Inertia or Rails+Inertia, adapted to NyalaJS.

## How this differs from the other 3 starters

| Starter | Frontend | How pages are built |
|---|---|---|
| `mvc` (basic-starter) | none (JSON API only) | — |
| `saas` | none (JSON API only) | — |
| `cms` | server-rendered React + a couple of islands | `view(Component, props)` renders full HTML server-side; only two screens (media upload, menu reorder) ship any client JS |
| **`inertia`** (this one) | full client-side React app | `inertia(req, res, "Posts/Index", props)` sends a JSON page object on every navigation after the first load; the React app owns rendering entirely, hydrated once and then driven by Inertia's client-side router |

Concretely: `cms-starter`'s pages never re-render in the browser after
first load (every link is a normal `<a>`, every form a normal POST). This
starter's navigation (`<Link>`, `useForm().post()`, ...) never triggers a
full page reload — the backend still owns routing/data, but the browser
only ever fetches a JSON prop blob after the first request.

## Pages and routes

| Route | Controller action | Page component | Notes |
|---|---|---|---|
| `GET /` | `AuthController.root()` | `Welcome` | Public marketing/framework-showcase landing page — no auth required |
| `GET /login`, `POST /login` | `AuthController` | `Auth/Login` | |
| `GET /register`, `POST /register` | `AuthController` | `Auth/Register` | |
| `GET /dashboard` | `DashboardController.index()` | `Dashboard/Index` | Guarded; real stats computed from `PostsService.findAll()` |
| `GET /posts`, `/posts/create`, `/posts/:id/edit` | `PostsController` | `Posts/Index`, `Posts/Create`, `Posts/Edit` | Guarded; the one full CRUD resource |
| `GET /settings` | `SettingsController.page()` | `Settings/Index` | Guarded; update name, change password |

`Dashboard`, `Posts`, and `Settings` all render inside `AdminLayout`
(`resources/js/layouts/admin-layout.tsx`) — a shadcn/ui admin shell with a
fixed sidebar on desktop that collapses into a `Sheet` drawer below the
`lg` breakpoint, plus a sticky topbar with the account dropdown. `Welcome`,
`Auth/Login`, and `Auth/Register` do **not** use `AdminLayout` — they're
public pages with their own chrome.

## The request/response flow, concretely

1. First visit to `/posts` (a normal browser navigation, no `X-Inertia`
   header): `PostsController.index()` returns `inertia(req, res,
   "Posts/Index", { posts: () => ... })`. `InertiaResponse.render()` sees
   no `X-Inertia` header, so it renders a full HTML shell
   (`@nyalajs/inertia`'s `html-shell.ts`) — a `<div id="app"
   data-page="...">` with the page object JSON-encoded into that
   attribute, plus a `<script>` loading `resources/js/app.tsx` (dev:
   straight from Vite's dev server; prod: the hashed build from Vite's
   manifest).
2. `resources/js/app.tsx` calls `createInertiaApp()` (re-exported from
   `@nyalajs/inertia/client`), which reads `data-page`, resolves
   `"Posts/Index"` to `resources/js/pages/Posts/Index.tsx` via
   `resolvePageComponent()` + `import.meta.glob()`, and mounts it with
   `{ posts: [...] }` as props.
3. Clicking a `<Link href="/posts/create">` does **not** navigate the
   browser. Inertia's client makes an XHR to `/posts/create` with
   `X-Inertia: true`. `InertiaResponse.render()` sees that header and
   returns just the JSON page object (`{ component, props, url, version }`)
   instead of a full HTML page. The client swaps in the new component.
4. Submitting a form (`useForm().post("/posts")`) that fails validation:
   the controller (`app/controllers/posts.controller.ts`) calls
   `PostValidator.safeParse()` by hand, flashes the Zod errors into the
   session via `flashValidationErrors()`, and redirects (303) back to
   `/posts/create`. The **next** `InertiaResponse` (rendering the create
   page again) picks those errors up automatically as `props.errors` — see
   `@nyalajs/inertia/src/inertia-response.ts`'s `resolveErrors()`. The
   Inertia client surfaces them as `useForm().errors` with zero extra code
   in the page component.
5. A successful create/update/delete flashes a message
   (`flash(req, "success", "Post created.")`) and redirects to `/posts`;
   `resources/js/layouts/admin-layout.tsx` reads `usePage().props.flash` to show it.
   Both `errors` and `flash` are **read-once** — they show up on exactly
   the next response, then clear themselves (see
   `@nyalajs/inertia/src/flash.ts`).
6. `user` (the logged-in user, or `null`) is a **shared prop** — merged
   into every `InertiaResponse` for the request by
   `InertiaShareMiddleware` (registered in `bootstrap/main.ts`), not
   passed explicitly by every controller action. See
   `@nyalajs/inertia/src/shared-props.ts`.

## What's in here

- **Auth** (`app/controllers/auth.controller.ts`,
  `app/guards/session-auth.guard.ts`): register/login/logout via
  `@fastify/secure-session` — same session-based approach as
  `cms-starter`, not the JWT pattern `mvc`/`saas` use (see
  `docs/inertia-starter-spec.md` §3 for why: this is one same-origin,
  cookie-authenticated app, not a separate API).
- **Dashboard** (`app/controllers/dashboard.controller.ts`,
  `resources/js/pages/Dashboard/`): stat cards + a recent-posts list, both
  computed from real `PostsService` data — not hardcoded placeholder numbers.
- **Posts** (`app/controllers/posts.controller.ts`,
  `app/services/posts.service.ts`, `app/repositories/post.repository.ts`,
  `resources/js/pages/Posts/`): the one full CRUD resource, demonstrating
  shared props, flash messages, and validation-error round-tripping end to end.
- **Settings** (`app/controllers/settings.controller.ts`,
  `resources/js/pages/Settings/`): update display name, change password —
  two independent forms on one page, each its own `useForm()`/controller action.
- **Data layer** (`app/models/`, `app/repositories/`): plain Drizzle
  `sqliteTable` schemas + a small `BaseRepository<T>` — same shape as
  `mvc`/`cms`'s Postgres-backed repositories, just SQLite (see "Why
  SQLite" below).
- **Frontend** (`resources/js/pages/`, `resources/js/layouts/`,
  `resources/js/components/ui/`, `resources/js/app.tsx`, `vite.config.ts`):
  a real Vite-built React app on Tailwind + [shadcn/ui](https://ui.shadcn.com),
  kept separate from the backend's `app/` — same split as Laravel's Inertia
  starter kits (`app/` = backend only, `resources/js/` = frontend only).
  `nyala dev` runs a real Vite dev server alongside the backend; `nyala
  build` runs `vite build` to produce the hashed production assets
  `@nyalajs/inertia`'s `AssetVersionResolver` reads.

## UI: Tailwind + shadcn/ui

`resources/js/components/ui/` holds the shadcn/ui primitives this starter
actually uses (`button`, `input`, `card`, `table`, `dialog`, `sheet`,
`dropdown-menu`, ...) — added the same way the shadcn CLI would generate
them (Radix primitives underneath, styled with Tailwind + `class-variance-authority`,
composed via `cn()` in `resources/js/lib/utils.ts`). Theming is CSS
variables in `resources/js/app.css` (`:root`/`.dark`), configured in
`tailwind.config.ts` and `components.json`. `@/*` resolves to
`resources/js/*` (see `vite.config.ts`'s `resolve.alias` and
`tsconfig.frontend.json`'s `paths`), matching shadcn's own import
convention (`@/components/ui/button`, `@/lib/utils`).

To add another shadcn component by hand, follow the same pattern as the
existing files in `resources/js/components/ui/` — install any Radix
package it needs, then write the component using `cn()` + `cva()` the same
way `button.tsx`/`card.tsx` do.

## Why SQLite

This starter defaults to `better-sqlite3` (see `config/database.ts`) so it
runs with zero external services to install — clone, `npm install`,
`npm run db:migrate`, done. `@nyalajs/database`'s `DatabaseService`
supports Postgres/MySQL too; swap `DB_DRIVER` (and `database/connection.ts`,
`app/models/*.ts`'s `drizzle-orm/sqlite-core` imports) for a real
deployment.

One consequence: `nyala db:migrate`/`db:seed` are **not** used here —
`packages/cli/runtime/migration-runner.ts` is hardcoded to Postgres (the
`postgres` package + a `postgres://` connection string). This starter runs
`database/migrate.ts`/`database/seed.ts` directly instead (see those
files' doc comments) — that's what `npm run db:migrate`/`npm run db:seed`
actually invoke.

## Getting started

```bash
npm install
cp .env.example .env
```

Generate session values (required — `bootstrap/main.ts` enables sessions
with no insecure default):

```bash
openssl rand -base64 32                     # SESSION_SECRET
openssl rand -base64 12 | cut -c1-16        # SESSION_SALT (must be exactly 16 chars)
```

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Visit `http://localhost:3000`. The seeder creates a sample login:
**admin@example.com / Password123**. `npm run dev` starts both a Vite dev
server (React, HMR) and the NyalaJS backend (`tsc-watch`) — see
`packages/cli/src/commands/vite-dev.command.ts` and `nyala.ts`'s `dev`
command.

## Production build

```bash
npm run build   # tsc → dist/, then `vite build` → public/build/ (manifest.json + hashed assets)
npm start        # node dist/bootstrap/main.js
```

## Tests

```bash
npm test
```

`tests/unit/` covers `AuthService`/`PostsService` (business logic, against
an in-memory fake repository — no live database needed) and
`PostsController` (the actual Inertia round trip: redirects, flashed
success messages, flashed validation errors reappearing as `props.errors`
on the next render). Same pattern as `examples/todo-api/tests/`.

## SSR (optional, off by default)

Server-side rendering is opt-in — see `@nyalajs/inertia/src/ssr/index.ts`'s
doc comment for the full setup (a `resources/js/ssr.tsx` entry, built
separately via `nyala build --ssr`, run as its own long-lived process). A
plain `nyala dev`/`nyala build`/`nyala start` never touches it.
