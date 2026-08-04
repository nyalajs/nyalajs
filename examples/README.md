# Examples

Real, runnable applications built on top of Nyala's starter kits — not scaffolding, actual business logic wired end-to-end.

| Example | Built on | What it shows |
|---|---|---|
| [todo-api](./todo-api) | [`basic-starter`](../templates/basic-starter) | Owner-scoped CRUD, JWT auth, a new resource added to a starter following its existing conventions. |
| [helpdesk-saas](./helpdesk-saas) | [`saas-starter`](../templates/saas-starter) | Multi-tenant support tickets — the centerpiece is a test that proves tenant A's data is unreachable from tenant B's context. |
| [devblog-cms](./devblog-cms) | [`cms-starter`](../templates/cms-starter) | A real developer blog: genuine long-form posts about Nyala's own architecture, seeded into the CMS starter's existing (unmodified) feature set. |
| [basic-app](./basic-app) | — | A minimal hand-written app (no CLI scaffold) showing the smallest possible `@nyalajs/core` + `@nyalajs/http` setup. |

Each app under `todo-api/`, `helpdesk-saas/`, and `devblog-cms/` has its own `README.md` with setup instructions (`npm install`, `.env`, migrations, seeding, `npm run dev`) and example requests. They're real npm workspace packages — installing at the repo root (`npm install`) links them against the local `@nyalajs/*` packages.

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
