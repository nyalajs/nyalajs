<div align="center">

<img src="./assets/logo.png" alt="Nyala Framework" width="200" />

# Helpdesk SaaS — Example App

</div>

A real, runnable multi-tenant support-ticket app built on top of
[`templates/saas-starter`](../../templates/saas-starter), Nyala's multi-tenant
starter kit. It exists to prove out — and let you poke at — the starter's
headline feature: **automatic tenant data isolation**, by adding a genuine
resource (Tickets) on top of the tenants/users foundation the starter already
provides.

Everything here — models, repositories, services, controllers, migrations,
seeders, tests — follows the exact same conventions as the starter's `User`
resource. If you're learning the SaaS starter, read this repo side-by-side
with `templates/saas-starter/app/**/user.*`.

## What's in here

- **Tenants & Users** — unmodified from the starter (`app/models/tenant.model.ts`,
  `app/models/user.model.ts`, `app/repositories/user.repository.ts`, ...).
- **Tickets** (new) — `app/models/ticket.model.ts`, `app/repositories/ticket.repository.ts`,
  `app/services/tickets.service.ts`, `app/controllers/tickets.controller.ts`.
- **Ticket comments** (new) — same pattern, one level down
  (`ticket-comment.model.ts` / `ticket-comment.repository.ts`).

Both new tables carry a `tenant_id` foreign key exactly like `users` does, and
both repositories extend `BaseRepository<T>` with `isTenantAware = true` (the
default) — see `app/repositories/base.repository.ts`. That base class reads
the active tenant from `TenantContext` (request-scoped, set by
`TenantMiddleware`) and:

- auto-filters every `findAll`/`findById`/`findOne`/`count` by `tenant_id`,
- auto-stamps `tenant_id` on `create()`,
- scopes `update()`/`delete()` to the active tenant so you cannot mutate
  another tenant's row even if you happen to know its id,
- **fails closed**: if a tenant-aware repository is used with no active
  tenant, every one of the above throws instead of silently touching every
  tenant's rows.

> **Fix applied in this example.** The copy of `BaseRepository.create()` here
> has one line added versus the starter template: it now calls
> `this.requireTenantFilter()` before inserting. In the starter as shipped,
> `create()` calls `getTenantId()` directly, which returns `undefined`
> instead of throwing when no tenant is active — so a tenant-aware
> repository's `create()` would silently insert a row with `tenant_id = NULL`
> instead of failing closed like every other method. The cross-tenant test
> suite here (`tests/unit/ticket.repository.spec.ts`) caught this. Everything
> else in `base.repository.ts` is unchanged.

## API

All routes below require a `Bearer` JWT (`AuthGuard`) whose payload carries
both `sub` (user id) and `tenantId` — `JwtTenantResolver` (global middleware,
wired first in `bootstrap/app.module.ts`) resolves the tenant from that same
token before the controller runs. There is intentionally no way to reach a
ticket route without a resolved tenant: no tenant means no `TenantContext`,
and no `TenantContext` means every repository call throws.

| Method | Path                        | Description                                   |
|--------|-----------------------------|------------------------------------------------|
| GET    | `/tickets`                  | List tickets (tenant-scoped), filter via `?status=` / `?priority=`, paginate via `?page=`/`?limit=` |
| GET    | `/tickets/:id`               | Get one ticket                                |
| POST   | `/tickets`                   | Create a ticket (`subject`, `description`, `priority?`) |
| PUT    | `/tickets/:id`                | Update `subject`/`description`/`priority`     |
| PATCH  | `/tickets/:id/status`         | Change status (`open`\|`in_progress`\|`resolved`\|`closed`) |
| PATCH  | `/tickets/:id/assign`         | Assign to an agent (`{ "assignedToId": "<userId>" }`, or `null` to unassign) |
| DELETE | `/tickets/:id`                | Delete a ticket                               |
| POST   | `/tickets/:id/comments`       | Add a comment (`{ "body": "..." }`)           |
| GET    | `/tickets/:id/comments`       | List a ticket's comments                      |

Plus everything the starter already had: `/health/*`, `/auth/*`, `/users/*`.

## Quick start

```bash
# From the repo root (this app is an npm workspace member)
npm install

# Build the framework packages this app depends on, if you haven't already
npm run build --workspace=packages/core --workspace=packages/http \
  --workspace=packages/security --workspace=packages/tenancy \
  --workspace=packages/audit --workspace=packages/observability \
  --workspace=packages/config --workspace=packages/database \
  --workspace=packages/validation --workspace=packages/events \
  --workspace=packages/queue --workspace=packages/mail \
  --workspace=packages/notifications --workspace=packages/storage \
  --workspace=packages/scheduler --workspace=packages/cache

cd examples/helpdesk-saas
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL to a real Postgres instance
# and JWT_SECRET to something other than the default.

npm run db:migrate         # creates tenants, users, tickets, ticket_comments, ...
npm run db:seed            # seeds 2 tenants ("acme", "globex") with users + sample tickets
npm run dev                # starts the API on :3000
```

## Running the tests

```bash
cd examples/helpdesk-saas
npm test
```

This runs the full unit suite (`tests/unit/*.spec.ts`) — **no live Postgres
required**. The repository/service tests replace the drizzle `db` singleton
(`database/connection.ts`) with an in-memory fake (`tests/unit/fake-db.ts`)
that understands the same `eq`/`and` query shapes `BaseRepository` builds, and
drive tenant switching with `TenantContext.run()` / `TenantContext.set()` —
the same pattern the framework's own test suites use (see
`packages/tenancy/src/__tests__/tenant-repository.spec.ts` and
`packages/database/src/__tests__/tenant-scoping.spec.ts`).

If you want to test against a real database, set `DATABASE_URL` in `.env`,
run migrations, and add integration specs under `tests/integration/` — the
`test:integration` script (`vitest run tests/integration`) is already wired
up in `package.json`, there just aren't any integration specs checked in
here yet since they'd require a live Postgres in CI.

### The isolation test, specifically

`tests/unit/ticket.repository.spec.ts` → `describe("cross-tenant isolation")`
is the test that matters most here. It:

1. Creates a ticket while `TenantContext` is set to `"tenant-a"`.
2. Switches `TenantContext` to `"tenant-b"` and asserts `findById()` returns
   `null`, `findAll()` returns an empty array, `update()` returns `null`
   (and leaves the row unchanged), and `delete()` returns `false` (and leaves
   the row in place).
3. Switches back to `"tenant-a"` and confirms the ticket is still there,
   untouched.

`tests/unit/tickets.service.spec.ts` repeats the same pattern one layer up —
`TicketsService.findOne()`/`addComment()`/`delete()` all throw
`NotFoundException` when called against another tenant's ticket, because the
underlying repository call returns nothing to act on.

## Demonstrating isolation manually (curl)

The starter's `AuthService` (`app/services/auth.service.ts`) is still a stub
inherited unmodified from `templates/saas-starter` — `/auth/register` and
`/auth/login` don't yet persist to the `users` table. Rather than build that
out (out of scope for this example), the walkthrough below signs two JWTs
directly with `JwtStrategy`, using the two tenants and users the seeder
already created. This is exactly what a real `/auth/login` would hand you.

1. Seed the database (`npm run db:migrate && npm run db:seed`), then note the
   two tenant/user ids it printed, or fetch them:

   ```bash
   psql "$DATABASE_URL" -c "select id, slug from tenants;"
   psql "$DATABASE_URL" -c "select id, tenant_id, email from users;"
   ```

2. Mint a JWT for a user in **acme** and one for a user in **globex** (same
   secret as `JWT_SECRET` in your `.env`):

   ```bash
   node -e '
     const jwt = require("jsonwebtoken");
     const secret = process.env.JWT_SECRET || "change-this-to-a-secure-random-string-in-production";
     console.log(jwt.sign({ sub: "<ACME_USER_ID>", tenantId: "<ACME_TENANT_ID>" }, secret, { expiresIn: "1h" }));
   '
   ```

   Repeat with `<GLOBEX_USER_ID>` / `<GLOBEX_TENANT_ID>` for the second token.

3. As **acme**, list tickets and grab one id:

   ```bash
   curl -s http://localhost:3000/tickets \
     -H "Authorization: Bearer $ACME_TOKEN" | jq
   # => 3 seeded tickets, all with tenantId == <ACME_TENANT_ID>
   ```

4. As **globex**, list tickets — you get a completely different, non-overlapping
   set:

   ```bash
   curl -s http://localhost:3000/tickets \
     -H "Authorization: Bearer $GLOBEX_TOKEN" | jq
   # => 2 seeded tickets, all with tenantId == <GLOBEX_TENANT_ID>
   #    None of acme's ticket ids appear here.
   ```

5. The actual proof — take an **acme** ticket id from step 3 and try to fetch
   it **as globex**:

   ```bash
   curl -s http://localhost:3000/tickets/<ACME_TICKET_ID> \
     -H "Authorization: Bearer $GLOBEX_TOKEN" -i
   # => HTTP/1.1 404 Not Found
   #    { "message": "Ticket <ACME_TICKET_ID> not found" }
   ```

   Same result for `PUT`, `PATCH .../status`, `PATCH .../assign`, `DELETE`,
   and `POST .../comments` against that id while authenticated as globex —
   `TicketsService` calls `findOne()` first (or the repository's own
   tenant-scoped `update`/`delete`), and the tenant filter means the row
   simply isn't there as far as globex's `TenantContext` is concerned. It
   isn't a permissions check bolted on top — the row is unreachable by
   construction.

## Project structure

Only the additions on top of `templates/saas-starter` are called out below;
everything else (`config/`, `bootstrap/main.ts`, `app/controllers/health.controller.ts`,
`app/controllers/auth.controller.ts`, `app/controllers/users.controller.ts`, ...)
is unchanged from the starter.

```
app/
├── models/
│   ├── ticket.model.ts              # tickets table (tenant_id FK, status/priority)
│   └── ticket-comment.model.ts      # ticket_comments table (tenant_id + ticket_id FK)
├── repositories/
│   ├── ticket.repository.ts         # tenant-aware (extends BaseRepository, isTenantAware=true)
│   └── ticket-comment.repository.ts # tenant-aware
├── services/
│   └── tickets.service.ts
├── controllers/
│   └── tickets.controller.ts        # @UseGuards(AuthGuard) on every route
├── dto/
│   ├── create-ticket.dto.ts
│   ├── update-ticket.dto.ts
│   ├── update-ticket-status.dto.ts
│   ├── assign-ticket.dto.ts
│   └── create-ticket-comment.dto.ts
└── validators/
    └── ticket.validator.ts          # Zod schemas for all of the above

database/
├── migrations/
│   ├── 0001_initial.ts              # tenants, users, audit_logs, refresh_tokens (from starter)
│   └── 0002_create_tickets_tables.ts # tickets, ticket_comments
└── seeders/
    ├── 01-tenants-and-users.seeder.ts  # 2 tenants (acme, globex), 2 users each
    └── 02-tickets.seeder.ts            # sample tickets + a comment thread per tenant

tests/unit/
├── fake-db.ts                       # in-memory drizzle `db` fake for BaseRepository
├── ticket.repository.spec.ts        # includes the cross-tenant isolation test
├── ticket-comment.repository.spec.ts
└── tickets.service.spec.ts
```

## Notes / deviations from the task's literal ask

- **`examples/*` was added to the root `package.json` workspaces list**
  (alongside the existing `packages/*` and `templates/*`) so
  `examples/helpdesk-saas` resolves `@nyalajs/*` as workspace packages via a
  plain `npm install` at the repo root, the same way `templates/saas-starter`
  does. Nothing under `templates/` or `packages/` was changed.
- **`database/migrations/0001_initial.ts`, copied from the starter, had a
  truncated `users` table statement** (`REFERENCES tena      );` — invalid
  SQL, apparently a corrupted edit in the template). It's fixed here to
  create the `users` table matching `app/models/user.model.ts`'s actual
  columns (`name`, `email`, `password`, `role`, `is_active`,
  `email_verified_at`, `last_login_at`). This file is not touched under
  `templates/saas-starter` — only the copy in this example.
- **`BaseRepository.create()`** — see the callout above under "What's in
  here"; one line added so it fails closed with no active tenant, matching
  every other method on the class.
- Ticket creation/comment authorship (`createdById`/`authorId`) reads the
  current user id off `RequestContext.userId`, injected via
  `@Inject("REQUEST_CONTEXT")` in `TicketsController`. `AuthGuard` is what
  populates `userId` on that context after verifying the JWT. This wasn't a
  pattern used anywhere else in the starter (its `UsersService`/`AuthService`
  are still TODO-stubs that don't reach the database), so it's new here but
  built entirely from existing `@nyalajs/http`/`@nyalajs/core` primitives —
  no framework changes.
