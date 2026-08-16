# Nyala Docs Site

Nyala's real documentation, served as a working [`inertia-starter`](../../templates/inertia-starter)-based app instead of a static site build. There's no separate content store and no build step that copies markdown anywhere — `DocsController`/`DocsService` read and render the actual [`website/docs/*.md`](../../website/docs) files at request time, the same files the real [VitePress docs site](../../website/docs/.vitepress) builds from. Edit a file under `website/docs/`, reload the page here, see the change — that's what makes this "dynamic" rather than a build artifact.

## How it works

1. `config/docs.ts`'s `sourceDir` points at `website/docs/` (two levels up from this app, resolved against `process.cwd()` — see that file's own comment for why not `__dirname`). Override with `DOCS_SOURCE_DIR` if you deploy this from a different checkout layout.
2. `app/docs/nav.ts` mirrors the real sidebar structure from [`website/docs/.vitepress/config.ts`](../../website/docs/.vitepress/config.ts) as plain data — every slug in it is checked against a real file by `tests/unit/nav.spec.ts`.
3. `GET /docs/*` (`app/controllers/docs.controller.ts`) reads `${slug}.md` off disk, and `DocsService.render()` (`app/services/docs.service.ts`) runs it through [`marked`](https://marked.js.org) for markdown → HTML and [`shiki`](https://shiki.style) for real syntax highlighting (the same highlighter VitePress itself uses) — not a naive `<pre>` dump.
4. The rendered HTML, extracted headings (for the right-hand "On this page" outline), and prev/next nav all flow to the frontend as ordinary Inertia props — see the [Pages and routes](#pages-and-routes) table below.
5. `GET /api/search` filters a real search index built from every nav-listed file's actual title and first paragraph — no client-side search index shipped to the browser, no third-party search service.

## Pages and routes

| Route | Controller action | Page component | Notes |
|---|---|---|---|
| `GET /` | `DocsController.home()` | `Home` | Landing page — links into every real doc group |
| `GET /docs/*` | `DocsController.show()` | `Docs/Show` or `NotFound` | `*` is the slug, e.g. `/docs/building-blocks/controllers` → `building-blocks/controllers.md` |
| `GET /api/search?q=` | `DocsController.search()` | — (JSON) | Filters the real search index by title/excerpt/group |

`Home`, `Docs/Show`, and `NotFound` all render inside `DocsLayout` (`resources/js/layouts/docs-layout.tsx`) — a Laravel-docs-style shell: a sticky header with a ⌘K search trigger, a grouped sidebar (collapsing into a `Sheet` drawer below `lg`), and (on `Docs/Show`) a sticky right-hand outline of the current page's real headings, tracked via `IntersectionObserver` as you scroll.

## Why this app has no auth, database, or Posts CRUD

This is `inertia-starter` with everything specific to its own demo (`Auth`, `Dashboard`, `Posts`, `Settings`, SQLite, sessions) removed — a docs viewer has no user accounts and nothing to persist. What's left is the actual reusable shell: Inertia + Vite + Tailwind + shadcn/ui, on top of which this app adds real, working content instead of demo CRUD.

## The rendering pipeline, concretely

`marked@12`'s renderer methods are synchronous and only receive plain strings (verified against the installed package's real `.d.ts` — not the token-object API newer `marked` versions use). Shiki's highlighter is async, and duplicate-safe heading IDs need whole-document state neither of which fits inside a single synchronous per-token call. So `DocsService`:

1. Renders the whole document once with a `marked` instance whose `code()`/`heading()` renderers emit HTML-comment placeholders (base64-encoded JSON) instead of real markup.
2. Resolves every placeholder in a second pass over the output string — real `await codeToHtml(...)` per code block, real running heading-id de-duplication.

Shiki is ESM-only; this app compiles to CommonJS like every other Nyala template. A plain `import("shiki")` gets compiled by `tsc` into `Promise.resolve().then(() => require("shiki"))` — still a synchronous `require()` that trips Node's experimental CJS-requiring-ESM path. `docs.service.ts` routes the import through `new Function("specifier", "return import(specifier)")` instead, which `tsc` can't see into and rewrite, forcing a genuine dynamic `import()` at runtime. Verified: `dist/app/services/docs.service.js` contains a real `import()`, and running the compiled server produces no `ExperimentalWarning`.

One real gap this surfaced: Shiki has no `env` grammar, but `website/docs/*.md` fences plenty of blocks as ` ```env ` (the same gap [VitePress's own build warns about](../../website/docs)). `DocsService` remaps `env` → Shiki's real `dotenv` grammar rather than passing it through unchecked — see `LANG_ALIASES` in `docs.service.ts`.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Visit `http://localhost:3000`. No database, no seeding, no session secrets to generate — this app reads `website/docs/` directly, so as long as you're running it from inside this monorepo checkout, it works with zero setup beyond `npm install`.

## Production build

```bash
npm run build   # tsc → dist/, then `vite build` → public/build/ (manifest.json + hashed assets)
npm start        # node dist/bootstrap/main.js
```

Deploying this outside the monorepo (so `website/docs/` isn't two directories up anymore)? Set `DOCS_SOURCE_DIR` to wherever the real docs content lives — e.g. bundle `website/docs/` alongside this app's `dist/` and point `DOCS_SOURCE_DIR` at that copy.

## Tests

```bash
npm test
```

- `tests/unit/nav.spec.ts` — every slug in `app/docs/nav.ts` resolves to a real file under `website/docs/`, checked against the real directory (not a fixture) so a typo'd or renamed slug fails CI instead of 404ing silently in production.
- `tests/unit/docs.service.spec.ts` — `DocsService`'s own logic (placeholder substitution, the `env`→`dotenv` language alias, heading-id de-duplication, path-traversal rejection, relative-link rewriting) against a real temp directory of real `.md` fixtures. Shiki's own highlighter is swapped for a lightweight stand-in via `__setCodeToHtmlForTests()` — Vitest's module runner can't execute this app's real dynamic `import("shiki")` (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`, a `vite-node` VM-sandbox limitation, not a bug: the same code runs correctly under plain Node). Real end-to-end Shiki output — including the `env` fix — was verified by running the compiled server and rendering every one of the 53 real `website/docs/*.md` files, checked for a `200` and, for `deployment/environment.md` specifically (the file with the most `env`-fenced blocks), for a real `shiki`-highlighted `<pre>` in the response.
