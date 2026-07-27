# Environment Variables

Nyala apps read configuration through `@nyalajs/config`'s `ConfigService`, fed by a project's `config/*.ts` namespace files. This page is a full reference of the real environment variables read by those namespace files across the three official starters, plus the variables read directly by framework packages (like `@nyalajs/observability`'s `Logger`) outside of that namespace system.

## How Configuration Loading Works

`ConfigService` (`packages/config/src/config.service.ts`) does two things:

1. On construction, it loads `.env` (and `.env.${NODE_ENV}`) via `dotenv`, then merges the result into `process.env`.
2. It exposes a `load(namespace, values)` method that registers a plain object under a namespace name, readable later via `get("namespace.key")` or `getNamespace("namespace")`.

Each starter's `bootstrap/app.module.ts` wires these together with a `useFactory` provider. Here's the saas-starter's, verbatim:

```typescript
// templates/saas-starter/bootstrap/app.module.ts
{
    provide: ConfigService,
    useFactory: () => {
        // Load all 13 config/*.ts namespaces so config.get("server.port"),
        // config.get("database.host"), etc. all resolve correctly.
        const configService = new ConfigService({ envFilePath: ".env" });
        for (const [namespace, values] of Object.entries(namespaces)) {
            if (values && typeof values === "object" && !Array.isArray(values)) {
                configService.load(namespace, values as Record<string, any>);
            }
        }
        return configService;
    },
},
```

The `namespaces` object it iterates over is assembled in `config/index.ts`, which simply imports every other file in `config/` and re-exports them as a keyed object:

```typescript
// templates/saas-starter/config/index.ts (13 namespaces)
export const namespaces: Record<string, Record<string, any>> = {
  app: appConfig,
  server: serverConfig,
  database: databaseConfig,
  auth: authConfig,
  cache: cacheConfig,
  queue: queueConfig,
  mail: mailConfig,
  storage: storageConfig,
  logging: loggingConfig,
  cors: corsConfig,
  security: securityConfig,
  session: sessionConfig,
  plugins: pluginsConfig,
  middleware: middlewareConfig,
};
```

Each individual `config/<name>.ts` file is a plain object literal that reads `process.env.SOME_VAR` with a hardcoded fallback — there's no schema validation by default (you can pass a Joi `schema` to `ConfigService`'s constructor if you want that; see `ConfigOptions` in `config.service.ts`).

**The exact set of namespaces differs per starter** — `basic-starter` and `cms-starter` don't have `cache`, `queue`, `mail`, `session`, `plugins`, or `middleware` namespaces at all, because they don't have the corresponding files in `config/`. Access an unregistered namespace and `getNamespace()` throws `Configuration namespace "x" not loaded`.

| Template | Namespace count | Namespaces |
|----------|:---:|---|
| `saas-starter` | 13 | `app`, `server`, `database`, `auth`, `cache`, `queue`, `mail`, `storage`, `logging`, `cors`, `security`, `session`, `plugins`, `middleware` |
| `basic-starter` | 7 | `app`, `server`, `database`, `auth`, `cors`, `security`, `logging` |
| `cms-starter` | 6 | `app`, `server`, `database`, `security`, `logging`, `storage` |

## Namespace Reference: saas-starter (13 namespaces)

Source: `templates/saas-starter/config/*.ts`.

### `app`

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_NAME` | `Nyala App` | |
| `NODE_ENV` | `development` | |
| `APP_URL` | `http://localhost:3000` | |

### `server`

| Variable | Default | Notes |
|----------|---------|-------|
| `HOST` | `0.0.0.0` | |
| `PORT` | `3000` | Coerced to `Number` |
| `BODY_LIMIT` | `1048576` (1MB) | Coerced to `Number` |

### `database`

| Variable | Default | Notes |
|----------|---------|-------|
| `DB_DRIVER` | `postgres` | |
| `DB_HOST` | `localhost` | |
| `DB_PORT` | `5432` | Coerced to `Number` |
| `DB_NAME` | `nyala` | |
| `DB_USER` | `postgres` | |
| `DB_PASSWORD` | `""` | |

::: warning `DATABASE_URL` vs. `DB_*`
`templates/saas-starter/.env.example` defines a single `DATABASE_URL` (e.g. `postgresql://user:password@localhost:5432/saas_db`), and the Kubernetes manifest (`k8s/deployment.yaml`) injects `DATABASE_URL` as well (see [Kubernetes](./kubernetes)). But `config/database.ts` as shown above does **not** read `DATABASE_URL` at all — it reads the discrete `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` variables. Setting only `DATABASE_URL` in a saas-starter deployment will not populate the `database` namespace; you need the `DB_*` variables set too if your app resolves connection info through `config.get("database.*")`. This is a real inconsistency in the current template — verify which one your actual database/repository layer consumes before deploying.
:::

### `auth`

| Variable | Default | Notes |
|----------|---------|-------|
| `JWT_SECRET` | `change-me-in-production` | Change this. Always. |
| `JWT_EXPIRES_IN` | `1h` | |

### `cache`

| Variable | Default | Notes |
|----------|---------|-------|
| `CACHE_DRIVER` | `memory` | |
| `REDIS_HOST` | `localhost` | Shared with `queue` |
| `REDIS_PORT` | `6379` | Coerced to `Number`, shared with `queue` |
| `REDIS_PASSWORD` | `undefined` | Shared with `queue` |
| `CACHE_TTL` | `300` | Seconds, coerced to `Number` |

### `queue`

| Variable | Default | Notes |
|----------|---------|-------|
| `QUEUE_DRIVER` | `bullmq` | |
| `REDIS_HOST` | `localhost` | |
| `REDIS_PORT` | `6379` | Coerced to `Number` |
| `REDIS_PASSWORD` | `undefined` | |
| `QUEUE_DEFAULT` | `default` | Queue name |
| `QUEUE_RETRIES` | `3` | Coerced to `Number` |

### `mail`

| Variable | Default | Notes |
|----------|---------|-------|
| `MAIL_DRIVER` | `smtp` | |
| `MAIL_FROM_NAME` | `NyalaJS App` | |
| `MAIL_FROM_ADDRESS` | `noreply@example.com` | |
| `MAIL_HOST` | `localhost` | |
| `MAIL_PORT` | `1025` | Coerced to `Number` (1025 = Mailhog default) |
| `MAIL_SECURE` | `false` | `"true"` string comparison |
| `MAIL_USER` | `undefined` | |
| `MAIL_PASS` | `undefined` | |

### `storage`

| Variable | Default | Notes |
|----------|---------|-------|
| `STORAGE_DRIVER` | `local` | |
| `STORAGE_LOCAL_ROOT` | `./storage` | |
| `STORAGE_PUBLIC_URL` | `/storage` | |
| `AWS_S3_BUCKET` | `""` | |
| `AWS_REGION` | `us-east-1` | |
| `AWS_ACCESS_KEY_ID` | `""` | |
| `AWS_SECRET_ACCESS_KEY` | `""` | |

### `logging`

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_LEVEL` | `info` | |
| — | `pretty: NODE_ENV !== "production"` | Not its own env var; derived from `NODE_ENV` |

`redact` is hardcoded to `["password", "token", "secret", "authorization"]` — not configurable via env var.

### `cors`

| Variable | Default | Notes |
|----------|---------|-------|
| `CORS_ORIGIN` | `*` | Comma-separated list, split into an array if set |
| `CORS_CREDENTIALS` | `false` | `"true"` string comparison |

`methods` is hardcoded to `["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]`.

### `security`

| Variable | Default | Notes |
|----------|---------|-------|
| `RATE_LIMIT_MAX` | `100` | Coerced to `Number` |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Coerced to `Number` |
| `BCRYPT_ROUNDS` | `12` | Coerced to `Number` |

### `session`

| Variable | Default | Notes |
|----------|---------|-------|
| `SESSION_DRIVER` | `cookie` | |
| `SESSION_SECRET` | `change-me-in-production` | Change this. |
| `SESSION_MAX_AGE` | `86400` (seconds, 1 day) | Coerced to `Number` |
| — | `secure: NODE_ENV === "production"` | Derived from `NODE_ENV`, not its own var |

### `plugins` and `middleware`

Neither reads any environment variables — `plugins` defaults to an empty array (`[]`) meant to hold `NyalaPlugin` instances registered in code, and `middleware.global` defaults to an empty array meant to hold `Middleware`-implementing classes registered in code.

## Namespace Reference: basic-starter (7 namespaces)

Source: `templates/basic-starter/config/*.ts`. Includes a few fields saas-starter's equivalent namespaces don't have.

### `app`

| Variable | Default |
|----------|---------|
| `APP_NAME` | `Nyala MVC App` |
| `NODE_ENV` | `development` |
| `APP_URL` | `http://localhost:3000` |
| `APP_DEBUG` | `false` (`"true"` string comparison) |
| `APP_TIMEZONE` | `UTC` |

`version` is hardcoded to `"1.0.0"`, not read from env.

### `server`

| Variable | Default |
|----------|---------|
| `HOST` | `0.0.0.0` |
| `PORT` | `3000` |
| `BODY_LIMIT` | `1048576` |
| `REQUEST_TIMEOUT` | `30000` (ms) |

### `database`

| Variable | Default |
|----------|---------|
| `DB_DRIVER` | `postgres` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `nyala_mvc` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | `""` |
| `DATABASE_URL` | `""` |
| `DB_POOL_MIN` | `2` |
| `DB_POOL_MAX` | `10` |
| `DB_SSL` | `false` (`"true"` string comparison) |

Unlike saas-starter, basic-starter's `database` namespace also carries `DATABASE_URL` (as a plain fallback field, `url`) and a connection `pool` with `min`/`max`, plus `ssl`.

### `auth`

| Variable | Default |
|----------|---------|
| `JWT_SECRET` | `change-me-in-production` |
| `JWT_EXPIRES_IN` | `1h` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |

`algorithm` is hardcoded to `"HS256"`; `password.saltRounds` (`10`) and `password.minLength` (`8`) are also hardcoded, not env-driven.

### `cors`

| Variable | Default |
|----------|---------|
| `CORS_ORIGIN` | `*` |
| `CORS_CREDENTIALS` | `false` |

`methods`, `allowedHeaders`, `exposedHeaders`, and `maxAge` (86400) are hardcoded.

### `security`

| Variable | Default |
|----------|---------|
| `RATE_LIMIT_MAX` | `100` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `CSRF_ENABLED` | `false` (`"true"` string comparison) |
| `CSRF_SECRET` | `csrf-secret-change-me` |

`helmet.enabled` is hardcoded `true`; `helmet.contentSecurityPolicy` is derived from `NODE_ENV === "production"`, not its own var.

### `logging`

| Variable | Default |
|----------|---------|
| `LOG_LEVEL` | `info` |
| `LOG_FILE_ENABLED` | `false` (`"true"` string comparison) |
| `LOG_FILE_PATH` | `./storage/logs/app.log` |

`pretty` is derived from `NODE_ENV !== "production"`. Note these `LOG_FILE_*` keys live in the `logging` config namespace but are **not** the same variables read by `@nyalajs/observability`'s `Logger` class — see [Logging Variables Outside the Namespace System](#logging-variables-outside-the-namespace-system) below.

## Namespace Reference: cms-starter (6 namespaces)

Source: `templates/cms-starter/config/*.ts`. The smallest of the three.

### `app`

| Variable | Default |
|----------|---------|
| `APP_NAME` | `Nyala CMS` |
| `NODE_ENV` | `development` |
| `APP_URL` | `http://localhost:3000` |

`debug` is derived from `NODE_ENV !== "production"`, not its own var.

### `server`

| Variable | Default |
|----------|---------|
| `HOST` | `0.0.0.0` |
| `PORT` | `3000` |

### `database`

| Variable | Default |
|----------|---------|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `nyala_cms` |
| `DB_USER` | `postgres` |
| `DB_PASSWORD` | `""` |
| `DATABASE_URL` | `""` |

### `security`

| Variable | Default |
|----------|---------|
| `RATE_LIMIT_MAX` | `100` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |

### `logging`

| Variable | Default |
|----------|---------|
| `LOG_LEVEL` | `info` |

`pretty` is derived from `NODE_ENV !== "production"`.

### `storage`

| Variable | Default |
|----------|---------|
| `STORAGE_DRIVER` | `local` |

### Session variables (not in a `config/*.ts` namespace)

`cms-starter`'s `.env.example` defines `SESSION_SECRET` and `SESSION_SALT` with **no default values and a comment stating there is no insecure fallback** — these gate the admin dashboard's session-based authentication. Unlike every other secret documented on this page, there's no `config/session.ts` file in `cms-starter` — these two are consumed directly wherever the CMS's session/auth code reads `process.env`, not through the namespace system. Treat them as required at startup.

## Full `.env.example` Reference

These are the real, complete example files from each template, verbatim.

### `templates/basic-starter/.env.example`

```env
# Application
NODE_ENV=development
APP_NAME="Nyala MVC App"
APP_URL=http://localhost:3000
APP_DEBUG=true
APP_TIMEZONE=UTC

# Server
HOST=0.0.0.0
PORT=3000
BODY_LIMIT=1048576
REQUEST_TIMEOUT=30000

# Database
DB_DRIVER=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nyala_mvc
DB_USER=postgres
DB_PASSWORD=
DATABASE_URL=

# Authentication
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Logging
LOG_LEVEL=info
LOG_FILE_ENABLED=false
LOG_FILE_PATH=./storage/logs/app.log

# CORS
CORS_ORIGIN=*
CORS_CREDENTIALS=true

# Security
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
CSRF_ENABLED=false
CSRF_SECRET=csrf-secret-change-me
```

### `templates/saas-starter/.env.example`

```env
# Application
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# JWT Configuration
JWT_SECRET=change-this-to-a-secure-random-string-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/saas_db

# Multi-Tenancy
TENANT_RESOLUTION_STRATEGY=subdomain
TENANT_REQUIRED=true

# Observability
LOG_LEVEL=info
SERVICE_NAME=saas-app

# Security
BCRYPT_ROUNDS=10
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# CORS
CORS_ORIGIN=http://localhost:3001
CORS_CREDENTIALS=true
```

Note `JWT_REFRESH_EXPIRES_IN`, `TENANT_RESOLUTION_STRATEGY`, `TENANT_REQUIRED`, `SERVICE_NAME`, and `RATE_LIMIT_WINDOW` (not `RATE_LIMIT_WINDOW_MS`) all appear in this `.env.example` but are **not** read by any file in `templates/saas-starter/config/` shown above — they're either consumed elsewhere in the app's own multi-tenancy/auth code, or documented ahead of the config file actually reading them. Don't assume every variable in `.env.example` maps to a `config/*.ts` namespace field — cross-check against the actual namespace file if you're relying on a specific one.

### `templates/cms-starter/.env.example`

```env
# Application
NODE_ENV=development
APP_NAME="Nyala CMS"
APP_URL=http://localhost:3000

# Server
HOST=0.0.0.0
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nyala_cms
DB_USER=postgres
DB_PASSWORD=
DATABASE_URL=

# Sessions (admin auth) — required, no insecure fallback.
# Generate with: openssl rand -base64 32   /   openssl rand -base64 12 | cut -c1-16
SESSION_SECRET=
SESSION_SALT=

# Storage (media uploads)
STORAGE_DRIVER=local

# Logging
LOG_LEVEL=info

# Rate limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

## Logging Variables Outside the Namespace System

`@nyalajs/observability`'s `Logger` class (`packages/observability/src/logging/logger.ts`) reads its own environment variables directly, independent of any `config/logging.ts` namespace:

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Pino log level (`debug`/`info`/`warn`/`error`) — shared name with the `logging` namespace's `LOG_LEVEL`, but read separately here |
| `LOG_FILE` | If set, enables file output via `pino-roll` instead of stdout |
| `LOG_MAX_SIZE` | File rotation size threshold (default `10m`), only used when `LOG_FILE` is set |
| `LOG_INTERVAL` | File rotation interval (default `1d`), only used when `LOG_FILE` is set |
| `APP_NAME` | Read by `ObservabilityModule`'s factory (`new Logger(process.env.APP_NAME ?? "nyala-app")`) to bind the logger's `serviceName` field |

Note `LOG_FILE` here is a different variable name from `basic-starter`'s `config/logging.ts` namespace fields `LOG_FILE_ENABLED` / `LOG_FILE_PATH` — setting the latter two does **not** turn on file logging in `Logger`, since `Logger` never reads `config.logging.file.*`; it reads `process.env.LOG_FILE` directly. If you're using `@nyalajs/observability`'s `Logger`, use `LOG_FILE`. See [Monitoring](./monitoring#logging) for the full `Logger` API.

## Required vs. Optional

Variables with **no safe default** that you must set explicitly before running in production:

| Variable | Where it matters |
|----------|-------------------|
| `JWT_SECRET` | All templates with JWT auth (`basic-starter`, `saas-starter`) — defaults to `change-me-in-production` / `change-this-to-a-secure-random-string-in-production`, which is obviously not safe to leave as-is |
| `SESSION_SECRET` | `cms-starter` — **no fallback at all**, per its `.env.example` comment |
| `SESSION_SALT` | `cms-starter` — same, no fallback |
| `DB_PASSWORD` | All templates — defaults to empty string |
| `DATABASE_URL` | `saas-starter`, `cms-starter` — defaults to empty string / a local dev connection string |

## Production Notes

Generate strong secrets rather than typing something memorable:

```bash
openssl rand -base64 32
```

Or from Node directly:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never commit `.env` files — all three starters' `.gitignore` should exclude them (confirm `cms-starter/.gitignore`, which is present, covers `.env` alongside `.env.example` being tracked).

## Next Steps

- [Monitoring](./monitoring) — the `Logger`, health checks, and metrics that some of these variables configure
- [Docker](./docker) — how to pass these variables into a container
- [Kubernetes](./kubernetes) — how the `saas-starter` manifest injects secrets
- [Production Checklist](./checklist) — a consolidated pre-deploy checklist
