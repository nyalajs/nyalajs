# Troubleshooting

Common problems people hit installing, running, and upgrading Nyala, organized as problem → cause → fix. If you don't see your issue here, check the [FAQ](./faq) or search [GitHub Issues](https://github.com/nyalajs/nyalajs/issues).

## Installation

### `nyala: command not found` after installing the CLI

**Cause:** The global npm bin directory isn't on your `PATH`, or the install didn't actually complete (silently failed on a permissions error).

**Fix:** Confirm the CLI installed:

```bash
npm list -g @nyalajs/cli
```

If it's missing, reinstall and watch for errors:

```bash
npm install -g @nyalajs/cli
```

If it installed but the command still isn't found, check where npm puts global bins and make sure that directory is on your `PATH`:

```bash
npm config get prefix
# then ensure $(npm config get prefix)/bin is on PATH
```

### `EACCES` / permission denied during global install

**Cause:** Your npm global prefix points at a directory your user doesn't own (common on macOS/Linux when npm was set up with `sudo` at some point).

**Fix:** Either install with `sudo` for this one command:

```bash
sudo npm install -g @nyalajs/cli
```

Or reconfigure npm to use a directory you own, which avoids needing `sudo` for any future global install:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### Node version mismatch

**Cause:** The repository's root `package.json` declares `"engines": { "node": ">=18.0.0", "npm": ">=9.0.0" }`. Older Node/npm can produce confusing install or runtime failures (missing globals, syntax errors in dependencies) rather than a clear version error.

**Fix:** Check your versions and upgrade if needed:

```bash
node --version   # must be >= 18.0.0
npm --version    # must be >= 9.0.0
```

Use a version manager (`nvm`, `fnm`, `volta`) if you need to juggle multiple Node versions across projects.

### `Cannot find module` / dependency resolution errors right after `nyala new`

**Cause:** Usually a stale or partially-installed `node_modules`, especially if `npm install` was interrupted or run with `--skip-install` and never followed up.

**Fix:** Clear and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

## Project Setup

### Server won't start / `.env` values seem to be ignored

**Cause:** `nyala new` generates a `.env.example` but not a `.env` — the app reads from `.env`, and if it doesn't exist, config falls back to hardcoded defaults (which usually don't match your local database).

**Fix:**

```bash
cp .env.example .env
```

Then edit `.env` with your actual `PORT`, `DB_*`, `JWT_SECRET`, and other values before starting the dev server.

### Port already in use (`EADDRINUSE`)

**Cause:** Something else — often a previous, still-running `npm run dev` — is already bound to port 3000 (the default).

**Fix:** Change the port in `.env`:

```env
PORT=3001
```

Or find and kill whatever's holding the port:

```bash
lsof -ti:3000
kill -9 $(lsof -ti:3000)
```

### Database connection error (`ECONNREFUSED` on `db:migrate` or app start)

**Cause:** PostgreSQL isn't running, or the connection details in `.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) don't match a running instance.

**Fix:** Confirm Postgres is actually up:

```bash
# Docker
docker ps | grep postgres

# Local (Linux)
systemctl status postgresql

# Local (macOS)
brew services list | grep postgresql
```

If you're using the project's `docker-compose.yml` (ships with the `mvc` and `saas` templates), start it:

```bash
docker-compose up -d
```

Then verify you can connect manually with the same credentials that are in `.env`:

```bash
psql -h localhost -U postgres -d nyala_app
```

### I selected MySQL or SQLite in `nyala new` and nothing connects

**Cause:** This is a real limitation, not a misconfiguration. `@nyalajs/database` currently only implements a PostgreSQL driver (Drizzle ORM's `node-postgres`). The `--database`/interactive prompt in `nyala new` accepts `mysql` and `sqlite`, and writes a `DB_DRIVER` value into generated config, but there's no MySQL or SQLite driver behind it — the config value is inert.

**Fix:** Use `--database=postgresql` (the recommended default), or run PostgreSQL locally/in Docker regardless of what you initially selected — just point `DB_HOST`/`DB_PORT`/etc. at a real Postgres instance. There's no supported way to run a Nyala app against MySQL or SQLite today.

### I used `--template=basic` and there's no database wiring / no auth

**Cause:** This is by design, not a bug. `basic` isn't a trimmed `mvc` — it's a bare scaffold. Its generated `config/database.ts` literally ships with the comment `// No ORM/database adapter ships yet`, and there's no auth controller, no user CRUD, and no migrations included.

**Fix:** If you wanted a working app with authentication and a real database connection out of the box, start over with `nyala new my-app --template=mvc` (or `--template=saas` for multi-tenancy) instead of `basic`.

## Authentication

### Login/register endpoints fail with a generic error, or tokens don't verify

**Cause:** Most commonly a missing or placeholder `JWT_SECRET`. The generated `.env.example` includes `JWT_SECRET=your-super-secret-jwt-key-change-this` as a reminder value, not a working one in any real sense — if it's left unset or empty, token signing/verification will fail or behave unpredictably.

**Fix:** Set a real, private `JWT_SECRET` (and `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`) in `.env` before testing auth endpoints.

### App throws on startup after upgrading `@nyalajs/http` to `2.0.0`: "SESSION_SECRET is required..."

**Cause:** This is an intentional breaking change in `2.0.0`. `FastifyAdapter` now requires `SESSION_SECRET` (minimum 32 characters) and `SESSION_SALT` (exactly 16 characters) whenever sessions are enabled, which is the default. Previously it silently fell back to a hardcoded, publicly-known secret — this is now a hard failure instead of a silent security hole.

**Fix:** Add both variables to `.env`:

```env
SESSION_SECRET=a-random-string-at-least-32-characters-long
SESSION_SALT=exactly16chars!!
```

Or, if your app doesn't use sessions at all, disable them explicitly in the adapter options: `session: false`. See the [Migration Guide](./migration).

### Requests from my frontend are being blocked by CORS after upgrading

**Cause:** Also a `2.0.0` breaking change. The default CORS policy changed from `origin: true, credentials: true` (any origin, credentials allowed) to `origin: false, credentials: false` (no cross-origin access at all).

**Fix:** Pass the new `corsOrigin` adapter option with your actual frontend origin(s):

```ts
new FastifyAdapter(container, {
  corsOrigin: 'https://app.example.com',
});
```

## Multi-Tenancy

### Queries throw "no active tenant context" after upgrading to `@nyalajs/database@2.0.0`

**Cause:** Another intentional `2.0.0` breaking change. Any `Model` backed by a table with a `tenant_id` column now enforces tenant scoping — `all()`, `find()`, `save()`, `create()`, and `delete()` throw instead of silently querying across every tenant when there's no tenant in context.

**Fix:** Set the tenant via `TenantContext` (exported from `@nyalajs/core`) before calling into tenant-scoped models — typically this means confirming your tenant-resolution middleware runs before the code path that hits the database. See [Multi-Tenancy: Setup](../multi-tenancy/setup) and the [Migration Guide](./migration).

### `X-Tenant-ID` header is being ignored on authenticated requests

**Cause:** As of `@nyalajs/tenancy@2.0.0`, `HeaderTenantResolver` deliberately returns `undefined` for any request that also carries an `Authorization` header — the tenant must come from the verified JWT on authenticated requests, not a client-controlled header, to prevent a client from spoofing its way into another tenant's data.

**Fix:** Don't rely on the header resolver for authenticated requests; make sure the tenant claim is present in the JWT and resolved via `JwtTenantResolver` instead.

## Migrations

### `nyala db:migrate` doesn't recognize my old `.sql` migration files

**Cause:** As of CLI `2.0.0`, `db:migrate`/`db:fresh` no longer use drizzle-kit's SQL-file migrator. They now execute `up(db)`/`down(db)` TypeScript functions (the format `nyala generate migration` produces), tracked in a `_nyala_migrations` table.

**Fix:** Migrations written for CLI `< 2.0.0` need to be ported to the new `up`/`down` TS format. See the [Migration Guide](./migration) for the full upgrade path, and use `nyala generate migration <name>` going forward to get the correct shape.

## Testing

### `HttpTestClient` requests return 404 for routes that definitely exist

**Cause:** If you're on `@nyalajs/testing < 2.0.0`, `TestingModule.compile()` had a bug where it never actually bound decorated controller routes — every request through `HttpTestClient` would 404 regardless of your route setup.

**Fix:** Upgrade `@nyalajs/testing` to `2.0.0` or later.

## Still stuck?

- Check the [FAQ](./faq) for conceptual questions.
- Check the [Migration Guide](./migration) if the problem started right after a package upgrade.
- Search or open an issue on [GitHub Issues](https://github.com/nyalajs/nyalajs/issues).
- Ask in [GitHub Discussions](https://github.com/nyalajs/nyalajs/discussions).
