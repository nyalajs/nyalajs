# Nyala Docs Site

Nyala's documentation, served as a real, full-CRUD [`inertia-starter`](../../templates/inertia-starter)-based app. Doc content lives in a real SQLite table (`app/models/doc.model.ts`), seeded from the actual [`website/docs/*.md`](../../website/docs) files — `database/seeders/doc.seeder.ts` reads every real file and inserts it as a real row. From there, every page is created/read/updated/deleted through the app itself: `DocsController` (`app/controllers/docs.controller.ts`) exposes real create/edit/delete forms alongside the read path, and `DocsService` renders whatever markdown is actually stored in the row right now — not a fixed copy of the original file.

## How it works

1. `database/migrations/0001_create_docs_table.ts` creates the `docs` table (`slug`, `title`, `group_title`, `sort_order`, `content`, timestamps). `npm run db:migrate` runs it directly via `tsx` (not `nyala db:migrate`, which is Postgres-only — see that file's own comment).
2. `npm run db:seed` runs `database/seed.ts` → `database/seeders/doc.seeder.ts`, which reads every file listed in `app/docs/nav.ts` (a plain-data mirror of the real [VitePress sidebar](../../website/docs/.vitepress/config.ts) — checked against real files by `tests/unit/nav.spec.ts`) and inserts its raw markdown as a real row. Idempotent (`onConflictDoNothing()` on the unique `slug` column) — safe to re-run.
3. `GET /docs/*` (`app/controllers/docs.controller.ts`) looks the slug up via `DocRepository.findBySlug()`, and `DocsService.render()` runs whatever `content` is actually stored right now through [`marked`](https://marked.js.org) (markdown → HTML) and [`shiki`](https://shiki.style) (real syntax highlighting, the same highlighter VitePress itself uses) — not a naive `<pre>` dump, and not a fixed copy of the seed content once someone's edited it.
4. `GET /docs/create`, `GET /edit/*`, `POST /docs`, `PUT /docs/*`, `DELETE /docs/*` are real writes against the same table — see [Full CRUD, concretely](#full-crud-concretely) below.
5. `GET /api/search` filters real rows by title/content/group substring match — no separate search index to keep in sync, no third-party search service.

## Pages and routes

| Route | Controller action | Page component | Notes |
|---|---|---|---|
| `GET /` | `DocsController.home()` | `Home` | Landing page — links into every real doc group, pulled live from the DB |
| `GET /docs/create` | `DocsController.createPage()` | `Docs/Create` | |
| `POST /docs` | `DocsController.create()` | — (redirect) | Validated via `DocValidator`; flashes field errors back to `Docs/Create` on failure |
| `GET /edit/*` | `DocsController.editPage()` | `Docs/Edit` | `*` is the slug — see [Route shape](#route-shape-why-edit-is-not-under-docs) for why this isn't `/docs/:slug/edit` |
| `PUT /docs/*` | `DocsController.update()` | — (redirect) | |
| `DELETE /docs/*` | `DocsController.destroy()` | — (redirect) | |
| `GET /docs/*` | `DocsController.show()` | `Docs/Show` or `NotFound` | `*` is the slug, e.g. `/docs/building-blocks/controllers` |
| `GET /api/search?q=` | `DocsController.search()` | — (JSON) | |

Every page renders inside `DocsLayout` (`resources/js/layouts/docs-layout.tsx`) — a Laravel-docs-style shell: a sticky header with a ⌘K search trigger and a "New doc" shortcut, a grouped sidebar (collapsing into a `Sheet` drawer below `lg`), and (on `Docs/Show`) a sticky right-hand outline of the current page's real headings, tracked via `IntersectionObserver` as you scroll. `Docs/Show` also has real **Edit**/**Delete** buttons — Delete opens a real confirmation dialog before issuing the `DELETE`.

## Route shape: why "edit" is not under `/docs/`

Slugs are multi-segment (`building-blocks/controllers`, `deployment/environment`, ...), so they can only be matched with a trailing wildcard — `@Get("docs/*")` + `@Param("*")`. Fastify's router (`find-my-way`) has no way to express "match everything, but only if it's followed by a fixed literal segment," so a route declared as `docs/:slug/edit` silently only matches **single**-segment slugs. This was a real, live bug caught by actually testing it: `GET /docs/introduction/edit` worked, `GET /docs/building-blocks/controllers/edit` 404'd. The fix is `GET /edit/*` — putting the action before the slug instead of after it, so its own wildcard has nothing following it to conflict with. `PUT`/`DELETE` don't have this problem (no literal segment after the slug on those routes), so they stay on `docs/*`.

## Full CRUD, concretely

1. **Create**: `Docs/Create.tsx` posts to `POST /docs`. `DocValidator` (Zod) checks `slug` (lowercase, `-`/`/` only), `title`, `groupTitle`, `content` are present, and `DocsController.create()` separately checks the slug isn't already taken (`DocRepository.slugExists()`) before inserting — both failure paths flash field-specific errors back to the form via Inertia's `props.errors`, the same pattern as `inertia-starter`'s own forms.
2. **Read**: covered above — `DocsService.render()` on whatever's in the row right now.
3. **Update**: `Docs/Edit.tsx` (pre-filled from the real row) `PUT`s to `/docs/*`. Changing the slug is allowed — the uniqueness check excludes the row's own id (`DocRepository.slugExists(newSlug, existingId)`), and a successful update redirects to the *new* slug's URL.
4. **Delete**: a real confirmation `Dialog` on `Docs/Show.tsx`, then `DELETE /docs/*` — the row is actually gone from SQLite afterward (verified live, not just a 200 response — see [Verified](#verified-not-just-typechecked) below).

## Why this app has no auth

Full CRUD, but no login — anyone who can reach this app can create/edit/delete docs, the same trust model as a wiki. If you want to gate writes, `SessionAuthGuard` (`templates/inertia-starter/app/guards/session-auth.guard.ts`) is the real pattern to copy: add it, register `AuthController`, and `@UseGuards(SessionAuthGuard)` the mutating routes.

## The rendering pipeline, concretely

`marked@12`'s renderer methods are synchronous and only receive plain strings (verified against the installed package's real `.d.ts` — not the token-object API newer `marked` versions use). Shiki's highlighter is async, and duplicate-safe heading IDs need whole-document state — neither fits inside a single synchronous per-token call. So `DocsService`:

1. Renders the whole document once with a `marked` instance whose `code()`/`heading()` renderers emit HTML-comment placeholders (base64-encoded JSON) instead of real markup.
2. Resolves every placeholder in a second pass over the output string — real `await codeToHtml(...)` per code block, real running heading-id de-duplication.

Shiki is ESM-only; this app compiles to CommonJS like every other Nyala template. A plain `import("shiki")` gets compiled by `tsc` into `Promise.resolve().then(() => require("shiki"))` — still a synchronous `require()` that trips Node's experimental CJS-requiring-ESM path. `docs.service.ts` routes the import through `new Function("specifier", "return import(specifier)")` instead, which `tsc` can't see into and rewrite, forcing a genuine dynamic `import()` at runtime. Verified: `dist/app/services/docs.service.js` contains a real `import()`, and running the compiled server produces no `ExperimentalWarning`.

One real gap this surfaced: Shiki has no `env` grammar, but the seeded content (originally `website/docs/*.md`) fences plenty of blocks as ` ```env ` (the same gap [VitePress's own build warns about](../../website/docs)). `DocsService` remaps `env` → Shiki's real `dotenv` grammar rather than passing it through unchecked — see `LANG_ALIASES` in `docs.service.ts`.

## Getting started

```bash
npm install
cp .env.example .env
```

Generate session values (required — `bootstrap/main.ts` enables sessions, which `flash()`/validation-error round-tripping on the CRUD forms depend on):

```bash
openssl rand -base64 32                     # SESSION_SECRET
openssl rand -base64 12 | cut -c1-16        # SESSION_SALT (must be exactly 16 chars)
```

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Visit `http://localhost:3000`. `db:seed` populates the real Nyala docs (52 pages as of this writing) so the app starts with genuine content, not an empty table — running it again is a no-op (idempotent, see [How it works](#how-it-works)).

## Production build

```bash
npm run build   # tsc → dist/, then `vite build` → public/build/ (manifest.json + hashed assets)
npm start        # node dist/bootstrap/main.js
```

`storage/database.sqlite` needs to exist and be migrated/seeded before `npm start` — same as `inertia-starter`'s own production notes.

## Tests

```bash
npm test
```

- `tests/unit/nav.spec.ts` — every slug in `app/docs/nav.ts` resolves to a real file under `website/docs/`, checked against the real directory (not a fixture), so a typo'd or renamed slug fails CI instead of silently being skipped by the seeder.
- `tests/unit/doc.seeder.spec.ts` — runs the real seeder against a real SQLite table and the real `website/docs/*.md` tree: asserts it actually inserts real, non-trivial content (not just that it doesn't crash), and that re-running it doesn't duplicate rows.
- `tests/unit/docs.service.spec.ts` — real `DocRepository` CRUD (create/update/delete/slug-collision-detection) against a real SQLite table, plus `DocsService`'s rendering logic (placeholder substitution, the `env`→`dotenv` language alias, heading-id de-duplication, relative-link rewriting, nav grouping, prev/next, search). Shiki's own highlighter is swapped for a lightweight stand-in via `__setCodeToHtmlForTests()` — Vitest's module runner can't execute this app's real dynamic `import("shiki")` (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, a `vite-node` VM-sandbox limitation, not a bug: the same code runs correctly under plain Node, see below).

`vitest.config.ts` points every test at one shared SQLite file (`storage/test.sqlite`, gitignored) via `test.env.DB_PATH` — `database/connection.ts` reads `DB_PATH` in a module-top-level `new Database(...)` call, and under ESM semantics all of a spec file's `import`s run before the rest of that file's own code, so a spec-local `process.env.DB_PATH = ...` assignment (even written textually first) actually loses the race and silently points at this app's real `storage/database.sqlite`. Each DB-touching spec file drops and recreates the table itself in `beforeAll` for real isolation regardless of run order; `fileParallelism: false` keeps them from racing each other over the one shared file.

## Verified, not just typechecked

Every real bug below was caught by actually running the compiled server and the real database — not by reading the code and assuming it was right:

- **Missing DI registration**: `DocRepository` wasn't listed in `bootstrap/app.module.ts`'s `providers`, so `DocsController` silently failed to resolve and **no routes registered at all** (`GET /` 404'd with "Route GET:/ not found") — Nyala's route resolver swallows a controller-resolution failure rather than crashing the boot, so this had zero compile-time or boot-time signal. Fixed by adding `DocRepository` to `providers`.
- **The `/edit` route-shape bug** described above — caught by testing a real multi-segment slug, not just the shortest one.
- **shiki's missing `env` grammar** — `ShikiError: Language 'env' is not included in this bundle` on every page seeded from a `.md` file with an `env`-fenced block, until `LANG_ALIASES` remapped it to `dotenv`.
- **`res.status(404)` doing nothing**: the real HTTP status for an Inertia response comes from the returned `InertiaResponse`'s own `.statusCode` property (`@nyalajs/inertia`), not from calling `.status()` on the raw Fastify reply beforehand. Fixed by setting `.statusCode` directly on the object `inertia()` returns.
- Full create → read → update → delete lifecycle run against the real compiled server with real `curl` requests and a real cookie jar, including a real duplicate-slug rejection and a real invalid-slug-format rejection, then confirmed the deleted row was actually gone from the SQLite file itself (not just that the HTTP layer returned 404).
