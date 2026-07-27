# Multi-Tenancy Setup

This guide walks through wiring `@nyalajs/tenancy` into a Nyala application from scratch: installing the package, registering tenant resolvers, mounting the middleware, and marking your database models as tenant-scoped.

If you started from the SaaS template (`nyala new my-saas --template=saas`), most of this is already in place — read through anyway, since it explains what the generated code is actually doing.

## 1. Install the Package

```bash
npm install @nyalajs/tenancy
```

`@nyalajs/tenancy` depends on `@nyalajs/core`, `@nyalajs/http`, and `@nyalajs/security`, and expects `reflect-metadata` as a peer dependency (the same one your app already imports at its entry point for decorator metadata).

## 2. What You're Wiring Together

Tenant support in Nyala is made of two independent pieces that you connect yourself:

1. **Resolution** (`@nyalajs/tenancy`) — figures out *which* tenant a request belongs to, and publishes that tenant id via `TenantContext` (from `@nyalajs/core`), an `AsyncLocalStorage`-backed store that's readable anywhere in the request's async chain.
2. **Enforcement** (`@nyalajs/database`) — the `Model` active-record base class reads `TenantContext.get()` and automatically scopes queries for any model whose table has a `tenantId` column.

Setup means: register one or more resolvers, mount `TenantMiddleware` globally so it runs before your route handlers, and give your tenant-owned tables a `tenantId` column. Nothing else is required for automatic scoping to work — see [Data Isolation](./isolation) for exactly how the enforcement side behaves.

## 3. Register Resolvers and the Middleware

`TenantMiddleware` is `@Injectable()` and takes its dependencies from the DI container via string tokens, so it's registered like any other provider — not instantiated with `new`.

```typescript
// bootstrap/app.module.ts
import { Module } from "@nyalajs/core";
import {
  TenantMiddleware,
  SubdomainTenantResolver,
  HeaderTenantResolver,
  JwtTenantResolver,
} from "@nyalajs/tenancy";
import { JwtStrategy } from "@nyalajs/security";

@Module({
  providers: [
    // Resolvers are tried in array order; the first one that returns a
    // tenant id wins. See ./resolution for what each resolver actually does.
    {
      provide: "TENANT_RESOLVERS",
      useFactory: (jwtStrategy: JwtStrategy) => [
        new SubdomainTenantResolver(),
        new HeaderTenantResolver(),
        new JwtTenantResolver(jwtStrategy),
      ],
      inject: [JwtStrategy],
    },
    // If true, requests that resolve no tenant at all throw
    // BadRequestException instead of continuing unscoped.
    { provide: "TENANT_REQUIRED", useValue: true },

    TenantMiddleware,

    // ...your other providers (JwtStrategy, services, etc.)
  ],
  controllers: [
    // ...
  ],
})
export class AppModule {}
```

`TENANT_RESOLVERS` and `TENANT_REQUIRED` are the only two configuration inputs `TenantMiddleware` reads — there is no separate `tenancy.config.ts` object it consults. If your app reads `TENANT_REQUIRED` from an environment variable, resolve it in the `useFactory`/`useValue` yourself:

```typescript
{ provide: "TENANT_REQUIRED", useValue: process.env.TENANT_REQUIRED === "true" }
```

## 4. Mount the Middleware Globally

`TenantMiddleware` has to run **before** anything that reads the current tenant — which in practice means before route handlers and before any guard that checks tenant ownership. Register it right after creating the app and attaching the HTTP adapter:

```typescript
// bootstrap/main.ts
import "reflect-metadata";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { TenantMiddleware } from "@nyalajs/tenancy";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule, {
    cors: true,
    helmet: true,
  });

  const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
    cors: true,
    helmet: true,
  });
  app.setHttpAdapter(httpAdapter);

  // Resolve TenantMiddleware from the DI container (it depends on
  // TENANT_RESOLVERS / TENANT_REQUIRED, so it can't be `new`'d directly)
  // and register it as global middleware.
  app.use(app.get(TenantMiddleware));

  await app.listen(3000, "0.0.0.0");
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
```

`app.use()` runs middleware in registration order, so anything you register after `TenantMiddleware` (auth middleware, logging, etc.) can safely assume the tenant has already been resolved.

Internally, the HTTP adapter wraps the *entire* request — middleware, guards, interceptors, and the handler — in a single `TenantContext.run()` scope before your global middleware even runs. That's what makes `TenantContext.set()` (called inside `TenantMiddleware`) visible everywhere downstream, including in `Model` static methods that have no access to the request object at all.

## 5. Mark Tenant-Owned Models

The enforcement side (in `@nyalajs/database`) decides whether a model is tenant-scoped by checking, at the schema level, whether it has a column mapped from a property literally named `tenantId`. Add it with the `@Column` decorator:

```typescript
// app/models/user.model.ts
import { Model } from "@nyalajs/database";
import { Table, Primary, Column, StringColumn } from "@nyalajs/database";

@Table("users")
export class User extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  // The property name MUST be `tenantId` — that's what SchemaRegistry and
  // TenantScope look for. The `name` option only controls the physical
  // column name in Postgres.
  @Column({ name: "tenant_id" })
  tenantId!: string;

  @StringColumn()
  email!: string;

  @StringColumn()
  name!: string;
}
```

Once a model has that `tenantId` property, every `Model.all()`, `Model.find(id)`, `Model.create(data)`, `instance.save()`, and `instance.delete()` call is automatically scoped to `TenantContext.get()` — and throws if no tenant is active. Models *without* a `tenantId` property (like a shared `Plan` table) are left completely unscoped. See [Data Isolation](./isolation) for the full mechanics.

Tables that are tenant-owned but shared by every tenant (like `tenants` itself) simply don't declare a `tenantId` property, so `Model` never scopes them.

## 6. Minimal Configuration Summary

Everything the tenancy package itself needs boils down to two DI tokens:

| Token | Type | Purpose |
|---|---|---|
| `TENANT_RESOLVERS` | `TenantResolver[]` | Ordered list of strategies tried until one returns a tenant id |
| `TENANT_REQUIRED` | `boolean` | If `true`, a request that resolves no tenant throws `BadRequestException` instead of proceeding unscoped |

There's no `config/tenancy.ts` file the framework reads on its own — if your app organizes configuration that way (as the SaaS template does, loading a typed namespace through `ConfigService`), that's an app-level convention, not something `@nyalajs/tenancy` requires.

```typescript
// config/tenancy.ts — app-level convention, not read by the framework directly
export default {
  resolution: process.env.TENANT_RESOLUTION_STRATEGY ?? "subdomain",
  required: process.env.TENANT_REQUIRED === "true",
};
```

You'd then read `config.get("tenancy.required")` inside the `useValue`/`useFactory` for `TENANT_REQUIRED` shown above.

## 7. Environment Variables (SaaS Template Convention)

The SaaS starter template ships these in `.env.example` — again, this is an app-level convention for driving the provider factories above, not something `@nyalajs/tenancy` parses itself:

```bash
# Multi-Tenancy
TENANT_RESOLUTION_STRATEGY=subdomain
TENANT_REQUIRED=true
```

## 8. Verify It's Working

With `SubdomainTenantResolver` and `TENANT_REQUIRED=true`, a request with no resolvable subdomain (and no other resolver matching) should be rejected:

```bash
curl -i http://localhost:3000/api/users
# HTTP/1.1 400 Bad Request
# { "message": "Tenant context required but not found" }
```

A request through a tenant subdomain (or with the fallback header) should succeed and only see that tenant's rows:

```bash
curl -i http://acme.localhost:3000/api/users
# HTTP/1.1 200 OK
```

If a tenant-scoped `Model` method runs and `TenantContext.get()` is still `undefined` even though you believe the middleware ran, double-check:

- `TenantMiddleware` is actually registered via `app.use(app.get(TenantMiddleware))`, not just listed as a provider — providers alone don't attach to the request pipeline.
- The middleware is registered before route handling starts (i.e. before `app.listen()` — `use()` after the server is already listening has no effect on already-bound routes).
- At least one resolver in `TENANT_RESOLVERS` can actually match the request shape you're testing with (e.g. `SubdomainTenantResolver` needs a `Host` header with 3+ dot-separated segments; see [Tenant Resolution](./resolution)).

## Alternative: A Hand-Rolled Tenant-Aware Repository

`@nyalajs/tenancy` and `@nyalajs/database`'s `Model` are the framework-provided path, but they're not the only way to build tenant scoping — the SaaS starter template (`nyala new my-saas --template=saas`) actually ships its own hand-rolled base repository instead of using `Model` or `TenantRepository` directly. It's worth knowing this pattern exists, since you'll see it if you start from that template:

```typescript
// app/repositories/base.repository.ts (SaaS starter template)
@Injectable()
export abstract class BaseRepository<T> {
  private tenantId?: string;

  constructor(
    protected readonly table: PgTable,
    protected readonly isTenantAware: boolean = true
  ) {}

  setTenantId(tenantId: string | undefined): void {
    this.tenantId = tenantId;
  }

  protected withTenantFilter(where?: SQL): SQL {
    const tenantId = this.tenantId;
    if (!tenantId || !this.isTenantAware) {
      return where || (undefined as any);
    }
    const tenantFilter = eq((this.table as any).tenantId, tenantId);
    return where ? (and(tenantFilter, where) as SQL) : tenantFilter;
  }

  async findAll(options?: { limit?: number; offset?: number; where?: SQL }): Promise<T[]> {
    // ...applies withTenantFilter() to every query
  }
}
```

Concrete repositories opt in or out per-table via the constructor flag:

```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(users, true); // tenant-aware
  }
}

@Injectable()
export class TenantRepository extends BaseRepository<Tenant> {
  constructor() {
    super(tenants, false); // NOT tenant-aware — this repository manages tenants themselves
  }
}
```

The important thing to understand about this pattern: it is **entirely app-level code**, independent of `@nyalajs/tenancy`. `setTenantId()` has to be called explicitly — nothing wires it to `TenantContext` automatically. If you adopt this pattern instead of `Model`, you're responsible for calling `repository.setTenantId(TenantContext.get())` yourself, typically from a request-scoped provider or a small bridging middleware, since `BaseRepository` here has no built-in connection to `TenantMiddleware` at all.

Given that gap, prefer `Model` (from `@nyalajs/database`) for new tenant-scoped tables — it's already wired end-to-end to `TenantContext` with a fail-closed guarantee (see [Data Isolation](./isolation)). Treat this `BaseRepository` pattern as what it is in the template: a working but manually-maintained alternative, not a framework guarantee.

## Frequently Asked Setup Questions

**Do I have to use `Model` for tenant-scoped tables, or can I write plain repositories?**
`Model` is what gives you automatic, fail-closed scoping with zero extra code. If you write your own repository layer instead (as above), you take on responsibility for applying and testing the tenant filter yourself on every method.

**What happens if I forget to register `TENANT_REQUIRED` as a provider?**
Resolution of `TenantMiddleware` from the container fails outright with `Provider not found: TENANT_REQUIRED` — the DI container resolves every constructor dependency by its token and throws if nothing is registered for it, so the constructor's `= false` default is only ever reachable if you construct `TenantMiddleware` by hand with `new TenantMiddleware(resolvers)` (skipping DI entirely), not through `app.get(TenantMiddleware)`. In practice, always register both `TENANT_RESOLVERS` and `TENANT_REQUIRED` explicitly, even if the value is just `{ provide: "TENANT_REQUIRED", useValue: false }`.

**With `TENANT_REQUIRED` set to `false`, what happens to unscoped requests?**
The middleware simply proceeds with `TenantContext.get()` staying `undefined` — no error at the middleware layer. That's fine for routes that touch no tenant-scoped `Model`, but the request will still fail the moment it reaches one, via that `Model`'s own fail-closed check (see [Data Isolation](./isolation)) — just later, and with a different error than the middleware's `BadRequestException`.

**Can I scope only some routes, not the whole app?**
`TenantMiddleware` registered via `app.use()` runs globally, for every request. If you need some routes to be tenant-agnostic (e.g. a public marketing page or a health check), the cleanest option is to keep `TENANT_REQUIRED` `false` globally and let each tenant-scoped `Model` enforce its own requirement — routes that never touch a tenant-scoped model simply never hit the fail-closed check.

**Do I need `@nyalajs/security`'s `JwtStrategy` even if I only use subdomain resolution?**
No — `JwtStrategy` is only a constructor dependency of `JwtTenantResolver`. If your `TENANT_RESOLVERS` array doesn't include a `JwtTenantResolver`, you don't need to construct or inject one for tenancy purposes (though you likely still need it for authentication itself).

## End-to-End Testing Your Setup

`@nyalajs/testing` gives you `TestingModule` and `HttpTestClient`, which build a real `NyalaApplication` with routes bound and send requests through Fastify's `.inject()` — no listening socket needed. This is the most reliable way to confirm your tenancy wiring actually works, end to end, rather than testing `TenantContext` or the resolvers in isolation:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { TestingModule } from "@nyalajs/testing";
import { HttpTestClient } from "@nyalajs/testing";
import { TenantMiddleware, HeaderTenantResolver } from "@nyalajs/tenancy";
import { AppModule } from "../bootstrap/app.module";

describe("Tenancy wiring", () => {
  let client: HttpTestClient;

  beforeAll(async () => {
    const moduleRef = await TestingModule.create({
      imports: [AppModule],
      providers: [
        { provide: "TENANT_RESOLVERS", useValue: [new HeaderTenantResolver()] },
        { provide: "TENANT_REQUIRED", useValue: true },
        TenantMiddleware,
      ],
    }).compile();

    const app = moduleRef.createNyalaApplication();
    app.use(app.get(TenantMiddleware));
    client = new HttpTestClient(app);
  });

  it("rejects requests with no resolvable tenant", async () => {
    const res = await client.get("/api/users");
    expect(res.statusCode).toBe(400);
  });

  it("scopes requests carrying a tenant header", async () => {
    const res = await client.get("/api/users", { "x-tenant-id": "tenant-a" });
    expect(res.statusCode).toBe(200);
  });
});
```

`TestingModule.create({...}).compile()` builds and boots a real root module (wiring an in-process `FastifyAdapter` and calling `app.bindRoutes()` for you), and `overrideProvider()` on the returned builder lets you swap real providers for mocks before compiling — useful if you want to test tenancy wiring against a fake `TenantsRepository` instead of a real database. `HttpTestClient` then wraps that application's Fastify instance so you can `.get()`/`.post()`/etc. against it directly, headers and all, and assert on the real HTTP response your `TenantMiddleware` and `Model` scoping actually produce.

## Next Steps

- [Tenant Resolution](./resolution) — how each resolver extracts a tenant id, and when to use which
- [Data Isolation](./isolation) — exactly how `Model` enforces scoping, and what happens on cross-tenant access
- [Best Practices](./best-practices) — pitfalls, testing, and migration considerations
