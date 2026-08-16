# Production Checklist

A practical checklist for taking a Nyala app to production. Every item here maps to something concrete documented on the other deployment pages — [Docker](./docker), [Kubernetes](./kubernetes), [Environment Variables](./environment), and [Monitoring](./monitoring) — rather than generic advice. Which items apply depends on which starter (`basic-starter`, `saas-starter`, `cms-starter`, `inertia-starter`) and which deployment target (Docker only, or Kubernetes) you're using.

## Quick Reference by Template

The four starters are not at the same level of deployment-readiness. Know which row you're on before working through the rest of this checklist:

| | `basic-starter` | `saas-starter` | `cms-starter` | `inertia-starter` |
|---|---|---|---|---|
| `Dockerfile` | ✅ | ✅ | ❌ (not added yet) | ❌ (not added yet) |
| `docker-compose.yml` | ✅ (app + Postgres, dev-only) | ❌ (npm scripts reference it, file missing) | ❌ | ❌ |
| Kubernetes manifest | ❌ | ✅ (`k8s/deployment.yaml`, Deployment + Service only) | ❌ | ❌ |
| Health endpoint | `/health`, `/health/live`, `/health/ready` (hand-rolled, unversioned) | `/v1/health/live`, `/v1/health/ready` (via `@nyalajs/observability`, versioned) | ❌ none currently | `/health` (hand-rolled, unversioned, no `/live`/`/ready` split) |
| `/metrics` endpoint | ❌ | Defined in code, **not registered** in `app.module.ts` | ❌ | ❌ |
| Config namespaces | 7 | 13 | 6 | 5 |
| Database | Postgres (`@nyalajs/database`) | Postgres (`@nyalajs/database`) | Postgres (`@nyalajs/database`) | SQLite (`better-sqlite3`, direct Drizzle — `@nyalajs/database` is listed in `package.json` but unused) |
| `nyala db:*` wired up | ✅ | ✅ | ✅ | ❌ — `db:migrate`/`db:seed` call `tsx database/migrate.ts`/`seed.ts` directly (the CLI's migration runner is Postgres-only) |

See [Docker](./docker), [Kubernetes](./kubernetes), and [Monitoring](./monitoring) for the detail behind each cell.

### Before Deploying cms-starter or inertia-starter Specifically

`cms-starter` and `inertia-starter` are the least deployment-ready of the four templates as of this writing — neither has a `Dockerfile` or a Kubernetes manifest, and `cms-starter` has no health endpoint at all. If you're taking either to production, treat these as prerequisites, not nice-to-haves:

- [ ] Added a `Dockerfile` — adapting `basic-starter`'s is the fastest path (see [Docker: CMS Starter](./docker#cms-starter-no-dockerfile-yet)). `inertia-starter` additionally needs a `vite build` step baked into the image (see its own `package.json`'s `build` script) before `dist/` is usable in production.
- [ ] (`cms-starter` only) Added at least one health route before wiring in a container `HEALTHCHECK` or a load balancer health check — there is nothing to point either at out of the box. (`inertia-starter` already has a bare `/health`.)
- [ ] Confirmed `SESSION_SECRET` and `SESSION_SALT` are set — both templates' session auth ships a placeholder value in `.env.example` (`change-this-to-a-secure-random-string-in-production`-style), not a working default; copying `.env.example` to `.env` without changing these is the actual risk to check for, since nothing stops the app from booting with the placeholder still in place.
- [ ] (`cms-starter` only) Reviewed `STORAGE_DRIVER` (defaults to `local`) — if media uploads need to survive redeploys/restarts on ephemeral container storage or Kubernetes, `local` storage won't persist across pod rescheduling; you'd need to mount a persistent volume or point uploads at object storage instead. (`inertia-starter` has no file-upload feature, so this doesn't apply to it.)
- [ ] (`inertia-starter` only) Confirmed the Vite build actually ran before `npm start` — `public/build/.vite/manifest.json` must exist, or `AssetVersionResolver` (`@nyalajs/inertia`) has nothing to resolve hashed asset paths against in production. `npm run build` (which is `nyala build`, and bundles the `vite build` step) covers this if you use it.

## Environment & Secrets

See [Environment Variables](./environment) for the full reference.

- [ ] `NODE_ENV=production` is set in the actual runtime environment (container, pod, or host) — several `config/*.ts` namespace fields derive behavior from it (e.g. `logging.pretty`, `session.secure` in `saas-starter`, `security.helmet.contentSecurityPolicy` in `basic-starter`).
- [ ] `JWT_SECRET` is set to a real generated value, not left as `change-me-in-production` (`basic-starter`) or `change-this-to-a-secure-random-string-in-production` (`saas-starter`). Generate with `openssl rand -base64 32`.
- [ ] `SESSION_SECRET` and `SESSION_SALT` are set to real generated values (`cms-starter` and `inertia-starter` only — both use session auth, not JWT) — neither has a working default; each ships only a placeholder in `.env.example` (e.g. `change-this-to-a-secure-random-string-in-production`), so nothing stops the app from booting with that placeholder still in place. Generate with `openssl rand -base64 32` (`SESSION_SECRET`) and `openssl rand -base64 12 | cut -c1-16` (`SESSION_SALT` — must be exactly 16 characters).
- [ ] `DB_PASSWORD` (and, for `saas-starter`/`cms-starter`, `DATABASE_URL`) is set to real credentials, not the empty-string default. Doesn't apply to `inertia-starter` — it's SQLite, no credentials involved.
- [ ] If relying on `saas-starter`'s `config/database.ts`, confirm you set the discrete `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` variables — that namespace does not read `DATABASE_URL` even though it appears in `.env.example` and the Kubernetes manifest. See the callout in [Environment Variables](./environment#database).
- [ ] `.env` is not committed to version control, and `.env.example` in the repo stays free of real secrets.
- [ ] `CORS_ORIGIN` is set to your real origin(s), not left as `*` (the default in `basic-starter`'s and `saas-starter`'s `cors` namespace) if the API is credentialed.
- [ ] Rate limiting variables (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`) reviewed for expected production traffic, not left at the template default of 100 requests / 60s.

## Application Build

See [Docker](./docker) for the exact build steps each template runs.

- [ ] `npm run build` completes with no errors on the exact commit being deployed — `tsc` only for `basic-starter`/`saas-starter`/`cms-starter`; for `inertia-starter` it's `nyala build`, which runs `tsc` **and** `vite build` (producing `public/build/.vite/manifest.json` — see the Inertia-specific bullet above).
- [ ] `npm start` (`node dist/bootstrap/main.js`) boots successfully against production-shaped environment variables, not just local defaults — this catches missing-required-var issues before they show up in a container.
- [ ] Test suite passes: `npm test` (all four starters define this via `vitest run`).
- [ ] `node_modules` used at runtime were installed with `npm ci --only=production` (or the equivalent full install for `saas-starter`'s builder stage), not a dev install with extra packages baked in. `inertia-starter` is the exception — its Tailwind/shadcn/Vite tooling and `@types/*` packages are dev-only, but `react`/`react-dom`/`@inertiajs/react`/Radix packages are real runtime `dependencies` the client bundle needs at build time, so don't trim those thinking they're dev-only.

## Database

- [ ] Migrations run against the target database: `npm run db:migrate` — wraps `nyala db:migrate` in `basic-starter`/`saas-starter`/`cms-starter`'s `package.json`. `inertia-starter` is different: `npm run db:migrate` calls `tsx database/migrate.ts` directly (not `nyala db:migrate` — the CLI's migration runner only supports Postgres, and this template is SQLite).
- [ ] Seeders (`npm run db:seed` / `nyala db:seed`) are **not** run against production unless the seed data is genuinely meant for prod — seeders in these templates are written for local/dev setup.
- [ ] If using `basic-starter`'s `DB_POOL_MIN`/`DB_POOL_MAX` fields, confirm the pool size is sized for your actual concurrency, not left at the defaults (`2`/`10`).
- [ ] Database is reachable from wherever the app actually runs — for the Kubernetes path in particular, there's no database `StatefulSet`/`Service` shipped in `templates/saas-starter/k8s/`, so this must point at an externally managed database. See [Kubernetes: What's Not Included](./kubernetes#what-s-not-included). Doesn't apply to `inertia-starter` — its SQLite file needs a persistent volume instead if you deploy it on Kubernetes, the same concern as `local` file storage anywhere else.

## Docker Image

See [Docker](./docker) for the full Dockerfile breakdown.

- [ ] `docker build` succeeds for the template in use (`npm run docker:build`).
- [ ] Image runs as its non-root `nodejs` user (both `basic-starter` and `saas-starter`'s Dockerfiles create and switch to this user — verify a custom Dockerfile you've adapted still does too).
- [ ] Exposed port in the image matches the `PORT` your app is actually configured to bind (`EXPOSE 3000` by default in both shipped Dockerfiles).
- [ ] If using `basic-starter`'s image, its `HEALTHCHECK` instruction targets `GET /health` — confirm that route exists and returns 200 under real conditions, not just locally.
- [ ] If adapting the image for `cms-starter` (which ships no Dockerfile currently), either add a working health route first or drop the `HEALTHCHECK` instruction — don't ship a health check against a route that doesn't exist.
- [ ] If relying on `saas-starter`'s `docker:up` npm script, note that **no `docker-compose.yml` ships with that template** — either add one (adapting `basic-starter`'s) or confirm you're not depending on it in CI/deploy tooling.
- [ ] Image is tagged with a real version and pushed to your registry — not left as the placeholder `saas-app:latest` used in the sample Kubernetes manifest.

## Health & Metrics

See [Monitoring](./monitoring) for the full breakdown, including per-template differences.

- [ ] You know which health endpoint shape your template actually exposes: `basic-starter`'s hand-rolled `/health`, `/health/live`, `/health/ready` (unversioned, ad hoc, not using `@nyalajs/observability`), `inertia-starter`'s similarly hand-rolled but single `/health` (no `/live`/`/ready` split), or `saas-starter`'s `@nyalajs/observability`-backed `/v1/health/live` and `/v1/health/ready` (versioned via `@Version("1")`). `cms-starter` currently has neither — confirm you've added one before deploying it.
- [ ] If you need readiness to reflect actual dependency health (e.g. database connectivity) rather than always reporting healthy, you've registered a real `HealthIndicator` via `HealthCheckService.registerIndicator()` — out of the box, no starter registers any indicators, so `checkReadiness()` always reports `up`.
- [ ] If you want a `/metrics` endpoint on `saas-starter`, you've added `MetricsController` to `bootstrap/app.module.ts`'s `controllers` array — it's defined in `app/controllers/health.controller.ts` but **not registered by default**.
- [ ] If you've enabled `/metrics`, something in your app actually calls `MetricsCollector`'s `incrementCounter`/`recordHistogram`/etc. on real requests — the collector doesn't populate itself automatically.
- [ ] `LOG_LEVEL` is set appropriately for production (e.g. `info`, not `debug`) to avoid noisy/expensive log volume.
- [ ] If you rely on file-based logging, you've set `LOG_FILE` (read directly by `@nyalajs/observability`'s `Logger`) — note this is a different variable from `basic-starter`'s `config/logging.ts` fields `LOG_FILE_ENABLED`/`LOG_FILE_PATH`, which aren't wired into that `Logger` class at all.

## Kubernetes (if deploying there)

Only relevant if you're using `templates/saas-starter/k8s/deployment.yaml` or something derived from it. See [Kubernetes](./kubernetes) for the full manifest walkthrough.

- [ ] The `app-secrets` Kubernetes Secret exists in the target namespace, with `jwt-secret` and `database-url` keys populated, **before** applying the Deployment — otherwise pods fail with `CreateContainerConfigError`.
- [ ] `image: saas-app:latest` in `deployment.yaml` has been replaced with your real registry path and a pinned version tag.
- [ ] **Probe paths match your actual routes.** As shipped, the manifest's `livenessProbe`/`readinessProbe` target `/health/live` and `/health/ready`, but `HealthController`'s `@Version("1")` decorator means the real routes are `/v1/health/live` and `/v1/health/ready` — this mismatch will cause probes to fail (404) against an unmodified `saas-starter` deployment. Fix one side or the other before relying on this manifest. See [Kubernetes: Probes](./kubernetes#probes) for the full explanation.
- [ ] Resource `requests`/`limits` (`256Mi`/`250m` requests, `512Mi`/`500m` limits per pod) have been reviewed against real measured usage, not left at template defaults.
- [ ] `replicas: 3` is an intentional choice for your traffic, not just the template default — there's no `HorizontalPodAutoscaler` in this manifest, so it won't scale on its own.
- [ ] You've accounted for what's genuinely missing from this manifest if you need it: Ingress/TLS termination, autoscaling, a `ConfigMap` for non-secret env vars, a `PodDisruptionBudget`. None of these ship with the template — see [Kubernetes: What's Not Included](./kubernetes#what-s-not-included).

## Multi-Tenancy (saas-starter only)

`saas-starter`'s `.env.example` defines `TENANT_RESOLUTION_STRATEGY` (default `subdomain`) and `TENANT_REQUIRED` (default `true`), even though neither is read by any `config/*.ts` namespace file — they're consumed by the app's own tenancy code, not the `ConfigService` namespace system documented in [Environment Variables](./environment).

- [ ] `TENANT_RESOLUTION_STRATEGY` matches how your production DNS/routing is actually set up (subdomain-based resolution needs wildcard DNS and a matching CORS origin policy).
- [ ] `TENANT_REQUIRED=true` is intentional for your rollout — confirm requests without a resolvable tenant are rejected the way you expect before real traffic hits it.
- [ ] `SERVICE_NAME` (`saas-app` by default) is set to something meaningful if you're aggregating logs from multiple services, since `Logger` attaches it to every log line — see [Monitoring: Logging](./monitoring#logging).

## Security Basics

- [ ] Secrets (`JWT_SECRET`, `SESSION_SECRET`, `DB_PASSWORD`, etc.) come from your secrets manager / Kubernetes Secret / environment injection — not hardcoded in a committed config file.
- [ ] `CORS_CREDENTIALS` and `CORS_ORIGIN` combination reviewed — allowing credentials with a wildcard origin is a common misconfiguration.
- [ ] `BCRYPT_ROUNDS` (`saas-starter`) is set to a reasonable production value (default `10`–`12` across templates) — don't drop it for speed without understanding the tradeoff.
- [ ] `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` are enabled and sane for your expected traffic pattern.

## Continuous Integration

Each starter's `package.json` already defines the scripts you'd wire into a CI pipeline — use the real ones rather than inventing a different toolchain:

```bash
# basic-starter
npm run lint            # eslint --fix over app/bootstrap/config/database/routes/tests
npm run format           # prettier --write
npm run test:coverage    # vitest run --coverage
npm run build             # tsc

# saas-starter
npm run lint              # eslint app bootstrap --ext .ts
npm run format:check      # prettier --check, non-mutating — the one to run in CI
npm run test:coverage     # vitest run --coverage
npm run build              # tsc

# inertia-starter
npm run lint              # eslint --fix over app/bootstrap/config/database/tests (.ts AND .tsx)
npm run format             # prettier --write — no format:check variant; use `prettier --check` directly in CI instead
npm run test:coverage      # vitest run --coverage
npm run build               # nyala build → tsc + vite build
```

- [ ] CI runs `lint` and, where it exists, `format:check` (not `format`, which rewrites files) on every change. `inertia-starter` doesn't define a `format:check` script — run `npx prettier --check "**/*.{ts,tsx,json,md}"` directly in CI for the same non-mutating effect.
- [ ] CI runs the test suite (`test`, or the narrower `test:unit`/`test:integration`/`test:e2e` scripts each starter defines) before allowing a merge.
- [ ] CI builds the Docker image (`npm run docker:build`) as a smoke test that the multi-stage build still succeeds, independent of whether it's pushed anywhere. Doesn't apply to `cms-starter`/`inertia-starter` — neither has a `Dockerfile` or a `docker:build` script yet.
- [ ] `saas-starter` and `inertia-starter`'s `test` scripts are both `vitest run --passWithNoTests` — meaning CI won't fail just because a package has zero tests yet. Don't mistake "CI is green" for "this package has test coverage."

## Rollback Plan

Decide this before you deploy, not during an incident:

- [ ] **Docker/host deploys** — you know the previous image tag and can redeploy it (`docker run` a specific `<registry>/<image>:<previous-tag>` rather than `:latest`, which is why pinning tags in the first place matters — see [Docker: Pushing to a Registry](./docker#pushing-to-a-registry)).
- [ ] **Kubernetes deploys** — `kubectl rollout undo deployment/saas-app` is available and you've verified `kubectl rollout history deployment/saas-app` actually has a prior revision to roll back to.
- [ ] **Database migrations** — you know whether the migration you just ran (`nyala db:migrate`) has a corresponding `db:rollback` path (`npm run db:rollback` is defined in `basic-starter`/`saas-starter`/`cms-starter`) and whether it's safe to run against data written after the migration. `inertia-starter` has no `db:rollback` script at all — its `database/migrate.ts` runs plain SQLite migrations with no rollback path; reverting means restoring `storage/database.sqlite` from a backup.

## Final Smoke Test

Once deployed, before calling it done:

```bash
# Health — adjust path per template, see Monitoring
curl https://your-app.example.com/health          # basic-starter, inertia-starter
curl https://your-app.example.com/v1/health/live   # saas-starter

# A real, authenticated-or-not route your app actually serves
curl https://your-app.example.com/                 # inertia-starter: renders the Welcome page

# Logs are flowing and structured
kubectl logs -l app=saas-app --tail=50   # if on Kubernetes
# or
docker logs nyala-app --tail=50          # if on Docker
```

Confirm the response codes, payload shapes, and log output match what's documented in [Monitoring](./monitoring) for your specific template — the four starters genuinely behave differently here, and assuming one template's behavior on another is the most common way this checklist gets skipped over inaccurately.

## Next Steps

- [Docker](./docker)
- [Kubernetes](./kubernetes)
- [Environment Variables](./environment)
- [Monitoring](./monitoring)
