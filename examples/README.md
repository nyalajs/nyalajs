# Examples

Real, runnable applications built on top of Nyala's starter kits — not scaffolding, actual business logic wired end-to-end.

| Example | Built on | What it shows |
|---|---|---|
| [todo-api](./todo-api) | [`basic-starter`](../templates/basic-starter) | Owner-scoped CRUD, JWT auth, a new resource added to a starter following its existing conventions. |
| [helpdesk-saas](./helpdesk-saas) | [`saas-starter`](../templates/saas-starter) | Multi-tenant support tickets — the centerpiece is a test that proves tenant A's data is unreachable from tenant B's context. |
| [devblog-cms](./devblog-cms) | [`cms-starter`](../templates/cms-starter) | A real developer blog: genuine long-form posts about Nyala's own architecture, seeded into the CMS starter's existing (unmodified) feature set. |
| [docs-site](./docs-site) | [`inertia-starter`](../templates/inertia-starter) | Nyala's real documentation, rendered live from the actual `website/docs/*.md` files at request time (real markdown → Shiki-highlighted HTML), not a static build — a Laravel-docs-style UI with search, on-this-page outline, and prev/next nav. |
| [basic-app](./basic-app) | — | A minimal hand-written app (no CLI scaffold) showing the smallest possible `@nyalajs/core` + `@nyalajs/http` setup. |

Each app under `todo-api/`, `helpdesk-saas/`, `devblog-cms/`, and `docs-site/` has its own `README.md` with setup instructions (`npm install`, `.env`, migrations/seeding where applicable, `npm run dev`) and example requests. They're real npm workspace packages — installing at the repo root (`npm install`) links them against the local `@nyalajs/*` packages.

## Running one

```bash
npm install                      # from the repo root
cp examples/todo-api/.env.example examples/todo-api/.env
# fill in DATABASE_URL, JWT_SECRET, etc.
cd examples/todo-api
npm run db:migrate
npm run db:seed
npm run dev
```

Swap `todo-api` for `helpdesk-saas` or `devblog-cms` — same flow, each README documents its specific env vars and seeded data.
