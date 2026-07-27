<div align="center">

<img src="./assets/logo.png" alt="Nyala Framework" width="200" />

# Nyala CMS Starter

</div>

A full-stack website starter: an admin dashboard, a CMS (pages, blog,
media, menus, forms), and the public-facing site — all one NyalaJS app, no
separate frontend project. Server-rendered by default; two screens (media
upload, menu reordering) are interactive [islands](../../docs/islands.md).

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

Visit `http://localhost:3000` for the public site, `http://localhost:3000/admin`
for the dashboard — the seeder creates an admin login:
**admin@example.com / Password123**. Change that password (or the seeded
user) before deploying anywhere real.

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

## Deliberate simplifications

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
npm run db:seed        # run database/seeders/
```
