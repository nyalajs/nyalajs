<div align="center">

<img src="./assets/logo.png" alt="Nyala Framework" width="200" />

# Nyala Dev Blog

</div>

A real, runnable example application: the [`cms-starter`](../../templates/cms-starter)
template, unmodified in terms of code and features, seeded with a real
developer/tech blog about building applications with Nyala JS instead of the
template's generic placeholder content. This exists to prove — not just
claim — that `cms-starter` is a full, working CMS: an admin dashboard, blog
posts with categories and tags, static pages built from content blocks, a
media library, menus, and a contact form, all in one server-rendered app.

Nothing here is a scaffold you have to fill in. Every controller, model,
migration, and admin screen is exactly what `nyala new my-site
--template=cms` generates — the only thing this example changes is the seed
data in `database/seeders/`.

## Getting started

```bash
npm install
cp .env.example .env
# edit .env: set DB_* vars, and SESSION_SECRET/SESSION_SALT (required — see below)
```

Generate session values:

```bash
openssl rand -base64 32                    # SESSION_SECRET
openssl rand -base64 12 | cut -c1-16        # SESSION_SALT (must be exactly 16 chars)
```

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Visit `http://localhost:3000` for the public blog, `http://localhost:3000/admin`
for the dashboard — the seeder creates an admin login:
**admin@example.com / Password123**. Change that password (or the seeded
user) before deploying anywhere real; these credentials are intentionally
predictable since this is a demo, not a production deployment.

## What's seeded

Running `npm run db:seed` populates:

- **4 categories**: Tutorials, Architecture, Release Notes, Case Studies.
- **8 tags**: TypeScript, Dependency Injection, Multi-Tenancy, ORM, Testing,
  CLI, Modules, Security.
- **8 blog posts** (7 published with staggered `publishedAt` dates, 1 left
  as a draft to demonstrate that draft/published status actually gates
  visibility on the public site):
  1. *Getting started with dependency injection in Nyala* — Tutorials
  2. *Building a multi-tenant SaaS with @nyalajs/tenancy* — Architecture
  3. *Why we chose Drizzle for @nyalajs/database* — Architecture
  4. *A tour of the nyala CLI generators* — Tutorials
  5. *Testing Nyala applications with Vitest* — Tutorials
  6. *Modules and the application graph: how Nyala wires everything together* — Architecture
  7. *Nyala 2.0: session auth, request validation, and a real CMS starter* — Release Notes
  8. *Draft: benchmarking Postgres connection pooling under load* — Case Studies (**draft**, won't appear on `/blog`)

  Every post's technical content is grounded in the actual framework source
  (`packages/core`, `packages/database`, `packages/tenancy`, the root
  `README.md`) — DI via `@Injectable()`/constructor injection, the
  `@Module()`/`NyalaFactory.create()` boot sequence, `@nyalajs/tenancy`'s
  fail-closed tenant scoping, the Drizzle-based data layer, the
  `nyala generate` CLI surface, and this repo's own Vitest-based test
  patterns. Nothing in the post content is invented.

- **2 pages**: `home` (hero + intro + CTA linking to the blog) and `about`
  (explains this is a Nyala JS demo blog built on `cms-starter`).
- **Header/footer menus** linking to Home, About, Blog, and Contact — all
  real routes/pages, not placeholders.
- **Site settings**: site name "Nyala Dev Blog", a description, contact
  email, footer text, and a GitHub social link.

## What's in here

- **Public site** (`app/controllers/public/`, `app/views/public/`): home
  page and any CMS page (rendered from `Page.blocks` — see
  `app/views/blocks/`), blog with pagination, contact form,
  `sitemap.xml`/`robots.txt`/`blog/rss.xml`.
- **Admin dashboard** (`app/controllers/admin/`, `app/views/admin/`):
  session-based login, pages, posts, categories/tags, media library, menu
  builder, users (admin-only), form submissions, site settings.
- **Islands** (`app/islands/`): `MediaUploader` (multi-file upload with real
  progress) and `MenuReorder` (drag-and-drop) — the two places this starter
  actually needs client-side JS. See `app/islands/manifest.ts` and
  [docs/islands.md](../../docs/islands.md).
- **Data layer** (`app/models/`, `app/repositories/`): plain Drizzle
  `pgTable` schemas + a small `BaseRepository<T>` — the same pattern as the
  `mvc`/`saas` starters, not the decorator-based `Model` class from
  `@nyalajs/database`.

## Routes to try

- `/` — homepage (hero + intro + link to the blog)
- `/blog` — paginated post index (7 published posts, newest first)
- `/blog/<slug>` — a post, e.g. `/blog/getting-started-with-dependency-injection-in-nyala`
- `/about` — About page
- `/contact` — contact form (submissions land in the admin dashboard)
- `/blog/rss.xml`, `/sitemap.xml` — generated feeds
- `/admin` — login, then dashboard, posts, categories, tags, media, menus, settings

## Deliberate simplifications (inherited from `cms-starter`)

- **Page content** is edited as raw JSON (an array of `{type, data}`
  blocks) in the admin, not a visual drag-and-drop builder.
- **Post content** is a plain HTML textarea, not a WYSIWYG editor.

Both are legitimate places to add an island later if you want a richer
editing experience — the rendering/build pipeline doesn't need to change to
support that.

## Commands

```bash
npm run dev          # dev server + island watch mode
npm run build         # tsc + island bundles (production)
npm run db:migrate     # apply pending migrations
npm run db:rollback    # roll back the most recent migration
npm run db:fresh       # drop schema, re-run all migrations
npm run db:seed        # run database/seeders/ (categories, tags, posts, pages, menus, settings)
npm test               # vitest — same smoke suite as cms-starter, no live DB required
```

## Relationship to `templates/cms-starter`

This example is a content fork, not a code fork. If you're looking for the
template itself (to start your *own* site from a clean slate), use
[`templates/cms-starter`](../../templates/cms-starter) or `nyala new my-site
--template=cms`. Use this example when you want to see the template running
with real content, or as a reference for what realistic seed data looks
like.
