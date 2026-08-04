# Examples

Real, runnable applications built on top of Nyala's starter kits — not conceptual walkthroughs, actual code you can clone and run today.

These live in the main [nyalajs/nyalajs](https://github.com/nyalajs/nyalajs) repository under `examples/`, alongside the framework itself — there's no separate examples repo.

## Available Examples

### [Todo API](https://github.com/nyalajs/nyalajs/tree/main/examples/todo-api)

Owner-scoped CRUD todos built on the [basic starter](../installation). Shows JWT auth, request validation, and a new resource added to a starter following its existing conventions.

**Features:**
- JWT authentication (register, login)
- Todos scoped to the authenticated user
- Database migrations & seeders
- 27 tests

**Tech Stack:** Nyala, PostgreSQL, Drizzle ORM, JWT

[View on GitHub →](https://github.com/nyalajs/nyalajs/tree/main/examples/todo-api)

---

### [Helpdesk SaaS](https://github.com/nyalajs/nyalajs/tree/main/examples/helpdesk-saas)

Multi-tenant support tickets built on the [SaaS starter](../multi-tenancy/overview). The centerpiece is a test suite that proves tenant A's data is genuinely unreachable from tenant B's context — not just "should be," actually verified.

**Features:**
- Multi-tenancy with automatic data isolation (`BaseRepository` + `TenantContext`)
- Tickets, comments, status changes, agent assignment
- Explicit cross-tenant isolation test suite
- 22 tests

**Tech Stack:** Nyala, PostgreSQL, `@nyalajs/tenancy`

[View on GitHub →](https://github.com/nyalajs/nyalajs/tree/main/examples/helpdesk-saas)

---

### [Dev Blog](https://github.com/nyalajs/nyalajs/tree/main/examples/devblog-cms)

A real developer blog built on the [CMS starter](../installation) — genuine long-form posts about Nyala's own architecture (DI, modules, tenancy, the ORM), seeded into the CMS starter's existing, unmodified feature set (admin dashboard, blog, pages, media, menus).

**Features:**
- Admin dashboard + server-rendered public site
- 8 real technical posts, 4 categories, 8 tags, 2 pages
- Session-based authentication
- 7 tests

**Tech Stack:** Nyala, PostgreSQL, server-rendered views

[View on GitHub →](https://github.com/nyalajs/nyalajs/tree/main/examples/devblog-cms)

---

## Getting Started with Examples

### Clone the Repository

```bash
git clone https://github.com/nyalajs/nyalajs
cd nyalajs
npm install
```

Installing at the repo root links every example against the local `@nyalajs/*` packages via npm workspaces.

### Choose an Example

```bash
cd examples/todo-api        # or helpdesk-saas, or devblog-cms
```

### Install and Run

```bash
cp .env.example .env
# fill in DATABASE_URL, JWT_SECRET, etc.

npm run db:migrate
npm run db:seed
npm run dev
```

Each example's own `README.md` documents its specific env vars, seeded data, and example requests — [helpdesk-saas's README](https://github.com/nyalajs/nyalajs/tree/main/examples/helpdesk-saas) in particular walks through proving tenant isolation with real curl commands.

## Learning Path

If you're new to Nyala, we recommend following this order:

1. **[Todo API](https://github.com/nyalajs/nyalajs/tree/main/examples/todo-api)** — start here to learn the basics: controllers, services, repositories, auth.
2. **[Dev Blog](https://github.com/nyalajs/nyalajs/tree/main/examples/devblog-cms)** — see a full CMS feature set (admin dashboard, content modeling, server-rendered views) already wired together.
3. **[Helpdesk SaaS](https://github.com/nyalajs/nyalajs/tree/main/examples/helpdesk-saas)** — master multi-tenancy and see the isolation guarantee actually tested.

## Contributing an Example

Want to add another example? Open a PR against [nyalajs/nyalajs](https://github.com/nyalajs/nyalajs) with a new app under `examples/`, built on one of the existing starter templates — see the three above for the expected shape (a real `README.md`, a real test suite, `npx tsc --noEmit` passing cleanly).

## Need Help?

- [Documentation](../introduction) - Full framework docs
- [GitHub Issues](https://github.com/nyalajs/nyalajs/issues) - Report issues
