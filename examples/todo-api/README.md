<div align="center">

<img src="./assets/logo.png" alt="Nyala Framework" width="200" />

# Todo API

</div>

A real, runnable Todo API built on top of the `basic-starter` template. It exists to prove out — and document — that template with a genuine authenticated resource: registration/login already worked, this adds a `todos` resource owned per-user on top of it, following the exact same Controller → Service → Repository → Model conventions used for `users`.

## What it does

- Users register and log in via the inherited auth flow (`/auth/register`, `/auth/login`) and receive a JWT.
- Authenticated users manage their own todos: create, list (paginated), view, update, mark complete/incomplete, and delete.
- A todo has a `title` (required), optional `description`, `completed` flag (defaults to `false`), optional `dueDate`, and a `userId` owner.
- Ownership is enforced in the repository layer — every query is scoped to the caller's `userId` (resolved from the JWT), so one user can never read, update, or delete another user's todos. Attempting to do so returns `404 Not Found`, exactly as if the todo didn't exist.

## Quick Start

```bash
# Install dependencies (run from the repo root so workspace packages link correctly)
npm install

# Setup environment
cp .env.example .env
# Edit .env with your database credentials and JWT secret

# Run database migrations (creates users, then todos)
npm run db:migrate

# Seed the database with sample users and todos
npm run db:seed

# Start the development server
npm run dev
```

The server starts on `http://localhost:3000` by default (see `PORT`/`HOST` in `.env`).

## Project Structure

This mirrors `templates/basic-starter` exactly, with a `todos` resource added alongside `users`:

```
app/
├── controllers/
│   ├── auth.controller.ts       # register / login / refresh / me (inherited)
│   ├── home.controller.ts
│   ├── users.controller.ts      # inherited
│   └── todos.controller.ts      # new: todo endpoints
├── models/
│   ├── user.model.ts            # inherited
│   ├── todo.model.ts            # new: todos table schema
│   └── index.ts
├── services/
│   ├── auth.service.ts          # inherited
│   ├── users.service.ts         # inherited
│   └── todos.service.ts         # new: todo business logic
├── repositories/
│   ├── base.repository.ts       # inherited
│   ├── user.repository.ts       # inherited
│   └── todo.repository.ts       # new: owner-scoped todo queries
├── validators/
│   ├── user.validator.ts        # inherited
│   └── todo.validator.ts        # new: Zod schemas for todo requests
└── dto/
    ├── create-user.dto.ts / update-user.dto.ts   # inherited
    └── create-todo.dto.ts / update-todo.dto.ts   # new

database/
├── migrations/
│   ├── 0001_create_users_table.ts   # inherited
│   └── 0002_create_todos_table.ts   # new: todos table + FK to users
└── seeders/
    ├── user.seeder.ts               # inherited
    └── todo.seeder.ts               # new: sample todos for seeded users

tests/
└── unit/
    ├── todos.service.spec.ts        # service-layer tests (in-memory repo fake)
    └── todos.controller.spec.ts     # controller-layer tests (auth + ownership)
```

## How ownership / current-user resolution works

`basic-starter` doesn't use guard-based auth (no `@UseGuards`/`AuthGuard` wiring — that pattern exists in `templates/saas-starter` and `templates/cms-starter`, but requires DI plumbing this template doesn't set up). Instead, `AuthController.me()` already establishes the idiomatic pattern for this template: read the `Authorization` header, verify the Bearer token via `AuthService.verifyToken()`, and use the `sub` claim as the user ID.

`TodosController` follows that exact pattern for every route: it extracts and verifies the token itself (see `TodosController.getUserId()`), then passes the resulting `userId` down to `TodosService`, which passes it to `TodoRepository`. Every repository method that touches a todo (`findAllForUser`, `findByIdForUser`, `updateForUser`, `deleteForUser`) takes `userId` and filters/`WHERE`-clauses on it — there is no code path that can fetch a todo without also checking who owns it.

## API Endpoints

### Authentication (inherited from basic-starter)
- `POST /auth/register` — Register new user
- `POST /auth/login` — Login, returns `accessToken` + `refreshToken`
- `POST /auth/refresh` — Refresh access token
- `GET /auth/me` — Get current user
- `POST /auth/logout` — Logout

### Todos (new)
- `GET /todos` — List the caller's own todos (paginated: `?page=1&limit=10`)
- `GET /todos/:id` — Get one of the caller's own todos
- `POST /todos` — Create a new todo
- `PUT /todos/:id` — Update a todo (title/description/completed/dueDate)
- `PATCH /todos/:id/complete` — Mark a todo complete (or pass `{ "completed": false }` to un-complete it)
- `DELETE /todos/:id` — Delete a todo

All `/todos` routes require `Authorization: Bearer <accessToken>`.

## Trying it with curl

First, get a JWT by logging in as one of the seeded users (`npm run db:seed` creates `admin@example.com` / `john@example.com` / `jane@example.com`, all with password `Password123`):

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "Password123"}'
```

This returns `{ "data": { "user": {...}, "accessToken": "...", "refreshToken": "..." } }`. Save the `accessToken`:

```bash
TOKEN="paste-the-accessToken-here"
```

**List your todos:**
```bash
curl http://localhost:3000/todos?page=1&limit=10 \
  -H "Authorization: Bearer $TOKEN"
```

**Get a single todo:**
```bash
curl http://localhost:3000/todos/<todo-id> \
  -H "Authorization: Bearer $TOKEN"
```

**Create a todo:**
```bash
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Write the README", "description": "Document every endpoint", "dueDate": "2026-08-10T00:00:00.000Z"}'
```

**Update a todo:**
```bash
curl -X PUT http://localhost:3000/todos/<todo-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Write a better README"}'
```

**Mark a todo complete:**
```bash
curl -X PATCH http://localhost:3000/todos/<todo-id>/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

**Delete a todo:**
```bash
curl -X DELETE http://localhost:3000/todos/<todo-id> \
  -H "Authorization: Bearer $TOKEN"
```

Trying any of the above with a token from a *different* user and someone else's todo `id` returns `404 Not Found` — the repository layer never matches rows it doesn't own.

## Testing

```bash
npm test          # run the full suite
npm run test:unit # unit tests only
```

Tests in `tests/unit/` cover `TodosService` and `TodosController` against in-memory fakes of `TodoRepository`/`AuthService` — no live Postgres connection is required to run them. They cover: creating a todo, listing only the caller's own todos, updating, completing/un-completing, deleting, and the cross-user "can't touch another user's todo" case at both the service and controller layers, plus missing/invalid Authorization headers.

Integration/e2e tests against a real database aren't included — wire up `tests/integration` against the `docker-compose.yml` Postgres instance if you need that level of coverage.

## Database

**Migrations:**
```bash
npm run db:migrate    # create users, then todos
npm run db:rollback   # roll back the last migration
npm run db:fresh      # drop everything and re-migrate
```

**Seeders:**
```bash
npm run db:seed       # seeds users, then todos tied to those users
```

`database/seeders/todo.seeder.ts` looks up the seeded `admin@example.com`, `john@example.com`, and `jane@example.com` users by email and attaches a handful of realistic sample todos to each — run the user seeder first (the default `db:seed` script does this automatically).

## Environment Variables

See `.env.example` for the full list. At minimum, set:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/todo_api
JWT_SECRET=change-this-in-production
```

## Docker

```bash
docker-compose up -d     # app + Postgres
docker-compose logs -f app
docker-compose down
```

## Everything else

This app inherits all of `basic-starter`'s conventions unchanged — Controllers stay thin and delegate to Services, Services hold business logic, Repositories own all database access, Zod validators guard request bodies/queries, and DTOs give type safety across layers. See `docs/ARCHITECTURE.md` for the full MVC layer breakdown.

## License

MIT
