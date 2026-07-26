# NyalaJS Production-Readiness Audit

**Date:** 2026-07-22
**Scope:** All 18 packages (`packages/*`), CLI, templates, examples, and docs.
**Method:** Full-file read-only review across four tracks — security/auth, data layer, HTTP/infra/performance, and DX/simplicity — each independently verified against actual source, not documentation claims.

## Verdict

**Not production-ready.** The runtime core (DI container shape, route dispatch, guard/interceptor pipeline, Zod validation) is a coherent, reasonably well-engineered design. But three things currently block real-world use regardless of team size:

1. **Multi-tenancy is unenforced.** The tenant-scope helper exists but is never called by the ORM, and the shipped header-based tenant resolver trusts a client-controlled header. Any multi-tenant deployment today is one missed manual filter away from cross-tenant data leakage.
2. **The DI container silently breaks its own singleton scope on every HTTP request.** Anything resolved through the per-request child container — which is every controller and its full dependency graph — gets reconstructed from scratch per request, defeating in-memory caches, counters, and connection wrappers, and adding real CPU/GC cost under load.
3. **The onboarding path is broken end-to-end.** The default `nyala new` template doesn't exist, the flagship example app throws on startup, the test-utility package 404s every route, and roughly a third of the core-concepts doc describes an API (`Scope`, `RequestContext.get()`, NestJS-style `switchToHttp()`) that was never built.

None of these require a rewrite — they're bugs in wiring, not architecture. The estimated fix is weeks, not months, if scoped to the P0/P1 list below.

---

## How to read this document

Findings are tagged **Critical / High / Medium / Low** by production impact, not by how hard they'd be to fix. Each cites the exact file:line verified during the audit. The [Roadmap](#roadmap) at the end groups everything into an execution order.

---

## 1. Security

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| S1 | **Critical** | Hardcoded fallback session secret (`"a-very-long-and-secure-session-secret-key..."`) and hardcoded salt used by `@fastify/secure-session` whenever `SESSION_SECRET` is unset. Sessions are on by default. Every deployment that forgets the env var shares a publicly-known secret in the npm source — full session forgery. | `packages/http/src/runtime/fastify-adapter.ts:113,116` |
| S2 | **Critical** | Tenant scoping is not enforced anywhere. `TenantScope.getScope()` builds a valid filter clause but is never called from `Model.all/find/save/delete`. The Active-Record base class has zero tenant awareness. | `packages/database/src/model.ts:19-78`, `packages/database/src/tenancy/tenant-scope.ts` |
| S3 | **Critical** | `HeaderTenantResolver` trusts the client-supplied `x-tenant-id` header with no verification against the authenticated user. `TenantMiddleware` takes the first non-empty resolver result — if this shipped resolver is registered (a documented option), any request can spoof its tenant. Combined with S2, this is a full cross-tenant bypass. | `packages/tenancy/src/resolvers/header-resolver.ts:9`, `packages/tenancy/src/middleware/tenant.middleware.ts:13-21` |
| S4 | **Critical** | The "trusted" `JwtTenantResolver` reads `request.user`, but `AuthGuard` never sets that property (it sets `context.context.tenantId/userId` instead). This resolver is dead code out of the box, pushing integrators toward the spoofable header resolver (S3) as the only thing that works. | `packages/tenancy/src/resolvers/jwt-resolver.ts:8` vs `packages/security/src/auth/auth.guard.ts:24-26` |
| S5 | **High** | CORS registered with `origin: true, credentials: true` by default — reflects any `Origin` while allowing credentialed requests. Effectively no CORS restriction unless explicitly overridden. | `packages/http/src/runtime/fastify-adapter.ts:141-144` |
| S6 | **High** | `jwt.verify()` called with no `algorithms` allowlist — no hardening against algorithm-confusion attacks. | `packages/security/src/auth/jwt-strategy.ts:33-36,59-61` |
| S7 | **High** | Swagger UI mounted at `/docs` by default unless explicitly disabled — full schema/route disclosure in production by default. | `packages/http/src/runtime/fastify-adapter.ts:57-99` |
| S8 | **High** | Validation is entirely opt-in (`@ValidateBody`/`.schema`). Unvalidated input can flow into `Model.save()`'s unguarded `{ ...this }` spread — a mass-assignment vector if a handler does `Object.assign(model, body)`. | `packages/http/src/runtime/fastify-adapter.ts:452-506`, `packages/database/src/model.ts:53` |
| S9 | **Medium** | CSRF plugin is registered but never wired into a hook/route — it validates nothing. | `packages/http/src/runtime/fastify-adapter.ts:179` |
| S10 | **Medium** | Username enumeration via timing: unknown-email path returns immediately, known-email path always runs `bcrypt.compare`, creating a measurable timing oracle. | `packages/security/src/auth/auth.service.ts:34-42` |
| S11 | **Medium** | No per-account login lockout/backoff — relies solely on global IP-based rate limiting. | `packages/security/src/auth/auth.service.ts` |
| S12 | **Medium** | `RolesGuard`/`PolicyGuard` fail **open** when no `@Roles()`/`@UsePolicy()` decorator is present — intended opt-in design, but there's no shipped global default-deny guard, so a forgotten decorator silently exposes a route. | `packages/security/src/authorization/roles.guard.ts:11-19`, `policy.guard.ts:31` |
| S13 | **Low** | bcrypt cost factor hardcoded to 10, not configurable. | `packages/security/src/auth/hashing.service.ts:6` |

**Solid and don't need touching:** no raw SQL string concatenation anywhere (Drizzle's parameterized builder used throughout); helmet/compression/rate-limit registered with sane defaults; DI container has circular-dependency detection; `PolicyGuard` fails closed on a misconfigured policy; JWT secret itself has no insecure default; dependency versions (fastify ^4.25, jsonwebtoken ^9, bcrypt ^5.1, drizzle-orm ^0.29, zod ^3.22) are current, maintained majors.

---

## 2. Data Layer & Reliability

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| D1 | **Critical** | No transaction API exists at all — no `withTransaction()`, no rollback-on-error, no savepoints. Any multi-step write is non-atomic. | `packages/database/src/database.service.ts`, `model.ts` |
| D2 | **High** | Migrations are internally inconsistent: `nyala generate migration` scaffolds a custom `up(db)/down(db)` TS stub, but `nyala db:migrate` runs Drizzle's own migrator, which expects drizzle-kit `.sql` files + `_journal.json`. The generated migration is never actually executed by the real runner. | `packages/database/src/model.ts:19-23,28-35`, `packages/cli/src/commands/generate.command.ts:370-382`, `migrate.command.ts:44-67` |
| D3 | **High** | None of `DatabaseService`/`CacheService`/`QueueService`/`EventBus` implement `onApplicationShutdown()`, so `app.close()` (wired to SIGTERM in the CLI template) never actually closes the pg pool, Redis connections, or BullMQ workers. Connections leak on every graceful restart/deploy. | `database.service.ts`, kernel lifecycle (`core/src/kernel/kernel.ts:33-39`) |
| D4 | **High** | Zero try/catch anywhere in `model.ts`/`database.service.ts` — raw driver errors (including SQL text, column/constraint names) propagate straight to callers/HTTP responses. Information-disclosure risk plus inconsistent error shapes. | `packages/database/src/model.ts`, `database.service.ts` |
| D5 | **High** | No eager-loading, relation helpers, or batching (`whereIn`) anywhere in the ORM layer — any related-record access degrades to N+1 by construction, with no framework escape hatch. | `packages/database/src/model.ts` |
| D6 | **High** | Default (no Redis URL) queue backend is an in-process `Map` with no persistence — a crash mid-job loses all pending/in-flight jobs. No retry, backoff, dead-letter queue, or idempotency keys even on the BullMQ path (jobs added with default options). | `packages/queue/src/queue.service.ts:13-38` |
| D7 | **Medium** | Default cache is an unbounded `Map` with lazy (read-time only) TTL eviction — unbounded memory growth under high key cardinality. Purely in-process: `@CacheEvict` only clears the local instance, so multi-replica deployments see stale/inconsistent cache with no invalidation propagation. `remember()` has no request-coalescing — concurrent misses cause thundering-herd recomputation. | `packages/cache/src/cache.service.ts:18-42,98-104` |
| D8 | **Medium** | `Model.save()` spreads all enumerable instance properties (`{ ...this }`) into the write payload rather than filtering to registered `@Column` fields — a correctness bug independent of S8's security angle (mixin fields like `SoftDeletes` leak into writes). | `packages/database/src/model.ts:53,57-58` |
| D9 | **Low** | `emitSync()` uses `Promise.all`, which doesn't isolate listener errors the way `emit()` does — first rejection short-circuits the caller even though other listeners keep running. | `packages/events/src/event-emitter.ts:52-57` |
| D10 | **Low** | `nyala db:fresh` runs `DROP SCHEMA public CASCADE` against whatever `DATABASE_URL` resolves, with no environment guard or confirmation prompt. | `packages/cli/src/commands/migrate.command.ts:88-119` |

**Solid:** `database.service.ts` uses a real `pg.Pool` (not per-query connections) with configurable `max`; cache/queue both support real distributed backends (ioredis/BullMQ) via dynamic import with graceful in-process fallback; `event-emitter.ts`'s async `emit()` correctly isolates per-listener errors; `schema/registry.ts` caches built Drizzle tables per model class.

---

## 3. Performance & Infrastructure

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| P1 | **Critical** | `createRequestScope()` returns a child container with its own empty `scopeCache`, and `resolveInternal()` only checks its own cache, never the parent's. Every provider resolved starting from the per-request container — i.e. every controller and its whole dependency graph — is reconstructed from scratch on every request, even when registered `Scope.SINGLETON`. `Scope.REQUEST` is a no-op too (only `TRANSIENT` is special-cased). Verified empirically: two request-scope resolutions of the same singleton token produced two distinct, non-equal instances. This is the single biggest perf/correctness issue in the hot path — it gets worse under load, not better. | `packages/core/src/di/container.ts:34-36,58-88`, `packages/http/src/runtime/fastify-adapter.ts:274,313` |
| P2 | **Critical** | `@Scheduled` jobs use real `node-cron` but are registered per-process with zero leader election, distributed lock, or persistence. Standard k8s `replicas: N` means every job fires N times per tick — silent duplicate billing runs, duplicate emails, etc. | `packages/scheduler/src/scheduler.service.ts:15-49` |
| P3 | **Critical** | Audit log is a plain mutable insert with no hash-chaining/signing/WORM constraint (editable/deletable by anyone with DB access), and persistence failures are caught and only `console.error`'d — the underlying action still succeeds while the audit trail silently gains a gap. | `packages/audit/src/database-audit-adapter.ts:11-30`, `audit-logger.ts:14-33` |
| P4 | **High** | Metrics (`MetricsCollector`, real prom-client Counter/Histogram/Gauge) are defined but never called from the request path — `http_requests_total`/`_duration_seconds` will always read zero. | `packages/observability/src/metrics/metrics-collector.ts` |
| P5 | **High** | No tracing at all — no OpenTelemetry, no spans, no exporter. `traceId` is just a UUID threaded through log lines. | `packages/observability/src/` |
| P6 | **High** | Nothing wires `SIGTERM`/`SIGINT` to `Kernel.shutdown()` inside the framework itself — that logic only exists in the CLI scaffold template. Any app that doesn't copy that boilerplate gets hard-killed mid-request under k8s. | `core/src/kernel/kernel.ts:33-40`, `application.ts:105-110` vs `cli/src/commands/new.command.ts:505-508` |
| P7 | **High** | Raw request bodies land unredacted in the audit trail and stdout — passwords/tokens on login or password-change endpoints get logged in cleartext. | `packages/audit/src/audit.interceptor.ts:42`, `audit-logger.ts:22-27` |
| P8 | **Medium** | Hot-path logging uses raw `console.log`/`console.error` + `JSON.stringify` instead of the injectable pino `Logger` that already exists in the observability package — no leveling, redaction, or rotation where it matters most. | `fastify-adapter.ts:347-359`, `exception-handler.ts:68-83` |
| P9 | **Medium** | Mail/notifications have no retry/backoff — `MailService` throws on first failure; `NotificationService` swallows per-channel errors with a bare `console.error`; the "sms" channel is a `console.log` stub. | `packages/mail/src/mail.service.ts:63-90`, `packages/notifications/src/notification.service.ts:46-51,100` |
| P10 | **Low** | Stack-trace exposure is gated on `NODE_ENV === "production"` exactly — leaks on any other env name (e.g. "staging"). | `exception-handler.ts:128` |
| P11 | **Low** | `RouteRegistry.match()` is dead code — real dispatch goes through Fastify's own radix router. Harmless today but linear-scan design would be a bottleneck if ever wired in. | `packages/http/src/routing/route-registry.ts:20-47` |

**Solid:** route/decorator metadata resolution genuinely happens once at boot, not per request; exception handling always converts errors to a proper HTTP response and never crashes the process; no blocking sync fs/crypto found in the request path; default security middleware (helmet, CORS plugin, Redis-backed rate-limit, CSRF plugin, compression, secure-session) is thoughtfully wired even where individual pieces need hardening (see S5, S9).

---

## 4. Simplicity & Developer Experience

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| X1 | **Critical** | `nyala new`'s default template is "mvc", but only `basic-starter/` and `saas-starter/` exist as folders — no `mvc-starter/`. The code also explicitly excludes `basic-starter` when the user picks "basic". Both the default and the "basic" choice fall through to a stub scaffold with no auth/CRUD and config files that say "no ORM/cache/queue/mail ships yet." Only "saas" produces a real app. | `packages/cli/src/commands/new.command.ts:32,68-88,122-131` |
| X2 | **Critical** | Both starter templates' `package.json` define `db:migrate`/`db:seed`/etc. as `tsx database/migrate.ts`, but that file doesn't exist in either template. Following the quick-start doc's own database-setup step fails immediately. | `templates/basic-starter/package.json`, `templates/saas-starter/package.json` |
| X3 | **Critical** | The flagship `examples/basic-app` throws at startup: `main.ts` calls `app.listen()` without ever calling `setHttpAdapter()`, doesn't depend on `@nyalajs/http`, and never imports `reflect-metadata` (required for decorators, unlike every generated template). | `examples/basic-app/src/main.ts` |
| X4 | **Critical** | `TestingModule.compile()` never runs the route-binding step that normally only happens inside `NyalaApplication.listen()`. Every controller route 404s in tests written against the documented `HttpTestClient` API — the framework's own test-utility package is unusable for its stated purpose. | `packages/testing/src/testing-module.ts:36-44`, `http-test-client.ts` |
| X5 | **High** | `docs/core-concepts.md` documents a `Scope` enum and `@Injectable({ scope })` API. The real decorator takes zero parameters — no scope concept exists in the actual DI container's public API (independent of the internal scoping bug at P1). | `docs/core-concepts.md:101-119` vs `packages/core/src/decorators/injectable.ts` |
| X6 | **High** | Widespread doc/API drift beyond X5: `RequestContext.get()/.set()` (documented) doesn't exist; `NyalaMiddleware` (documented name/signature) is actually `Middleware` with a different signature; `Guard`/`Interceptor`/exception classes are documented as importable from `@nyalajs/core` but actually live in `@nyalajs/http`; `context.switchToHttp().getRequest()` doesn't exist. A developer following the docs hits compile errors on nearly every non-trivial example. | `docs/core-concepts.md:238-461` |
| X7 | **High** | `docs/quick-start.md`'s very first command (`nyala new my-blog --template=basic-starter`) uses a template name that doesn't match any value the CLI actually accepts (`mvc`/`saas`/`basic`). | `docs/quick-start.md:8` vs `packages/cli/src/bin/nyala.ts:32` |
| X8 | **Medium** | `@ConfigValue()` is a literal stub — writes metadata that nothing reads. Looks like a working decorator, silently no-ops. | `packages/config/src/decorators/config-value.ts:6-10` |
| X9 | **Medium** | Env-var validation (fail-fast on missing `JWT_SECRET` etc.) is opt-in only, and every generated app instantiates `ConfigService` without a schema — so "production-ready out of the box" fail-fast startup checks don't actually run by default. | `packages/config/src/config.service.ts:18-19,61-95` |
| X10 | **Medium** | `basic-starter`'s `package.json` uses `workspace:*` dependency ranges (pnpm/Yarn-only) while the repo uses plain npm workspaces, and scaffolding doesn't rewrite them — `npm install` on a scaffolded app would fail outright if this template were reachable. | `templates/basic-starter/package.json:27-40` |
| X11 | **Low** | Root `package.json` is `0.1.0` and calls itself an "Enterprise Framework" while all 18 sub-packages are already `1.0.0`–`1.1.1` — confusing maturity signal with no documented versioning policy to explain the split. | root `package.json:2-3` |
| X12 | **Low** | `packages/http`'s fastify adapter duplicates Zod validation/error-formatting logic that `packages/validation`'s `ValidationPipe` already implements — `ValidationPipe` has no callers anywhere in the codebase. | `fastify-adapter.ts:452-507` vs `validation/src/validation.pipe.ts` |

**Solid:** the actual request pipeline (guards → interceptors → handler, param decorators, Zod validation wired off decorator metadata) is coherent and well-built for its size; `packages/validation`'s 61 lines are genuinely wired to the HTTP layer, not a stub; the CLI's migration runner (`migrate.command.ts`) is a real, non-trivial Drizzle-based implementation — just pointed at by the wrong npm script name in templates (X2); decorator/class names in `packages/security` genuinely match `docs/security.md`.

---

## Roadmap

### P0 — Blockers (do before anyone else evaluates or deploys this)
Fixing these is what separates "framework with bugs" from "framework people can trust with data."

1. **Enforce tenant scoping in the ORM** (S2, S3, S4) — make scoping mandatory at the query-builder level, not opt-in; either fix `JwtTenantResolver` to read the real auth context or remove the spoofable header resolver from defaults.
2. **Fix DI request-scope caching** (P1) — this is both a correctness bug (silent singleton breakage) and the top performance issue; likely a small, contained fix in `container.ts`'s scope-cache lookup.
3. **Remove hardcoded session secret/salt fallback** (S1) — fail startup instead of silently defaulting.
4. **Lock down default CORS** (S5) — default to same-origin/no-credentials, require explicit opt-in for reflected origins.
5. **Add a real transaction API** (D1) — at minimum `withTransaction()` with rollback.
6. **Fix migrations** (D2) — make `generate migration` and `db:migrate` agree on one mechanism (drizzle-kit, given the migrator already assumes it).
7. **Fix onboarding path** (X1, X2, X3, X4) — either make `mvc`/`basic` real templates or remove them as options; fix the example app; fix `TestingModule` route binding. This is the first five minutes of every evaluation.

### P1 — Required before calling any version "GA" / enterprise
8. Wire graceful shutdown for DB/cache/queue (`onApplicationShutdown`) and make SIGTERM/SIGINT handling a framework default, not scaffold-only boilerplate (D3, P6).
9. Wrap database errors before they reach callers (D4); add relation/batch-loading to avoid N+1 by default (D5).
10. Make queue default backend durable or fail loudly that it isn't; add retry/backoff/DLQ (D6).
11. Bound the default cache and support cross-replica invalidation, or clearly document it as single-instance-only (D7).
12. Pin JWT `algorithms` allowlist (S6); disable Swagger UI by default outside development (S7); wire the CSRF plugin to actually validate (S9).
13. Redact sensitive fields from audit/log output (P7); make audit persistence failures loud, not swallowed (P3).
14. Fix the scheduler to be safe under multiple replicas — leader election or an explicit "single-instance only" flag that fails startup if replicas > 1 is detectable (P2).
15. Reconcile docs with actual APIs (X5, X6, X7) — either fix the docs or fix the code; right now the docs actively mislead.

### P2 — Hardening / polish
16. Fail-fast config validation by default for generated apps (X9); make `@ConfigValue()` functional or remove it (X8).
17. Per-account login backoff (S11); constant-time-ish auth response (S10); consider a global default-deny guard option (S12).
18. Wire metrics collection into the actual request path (P4); scope tracing (even basic span-per-request) as a follow-up (P5).
19. Retry/backoff for mail/notifications (P9); replace ad hoc `console.*` logging in the hot path with the existing pino logger (P8).
20. Clean up dead code (route-registry linear matcher, unused `ValidationPipe` duplication) and resolve the version-numbering confusion (X11, X12, D9, P11).

---

## Suggested next step

Work through P0 as a single milestone before any external users touch this — each item is concrete and independently fixable. I can start wherever you want: the DI scope-cache bug (P1) and tenant-scope enforcement (S2/S3/S4) are the two with the widest blast radius and are good candidates to tackle first.
