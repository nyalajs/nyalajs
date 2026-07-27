# Tenant Resolution

Tenant resolution is the process of figuring out, from an incoming request, which tenant it belongs to — before any handler, guard, or repository runs. This page goes deep on the resolver implementations that ship in `@nyalajs/tenancy`, how `TenantMiddleware` chains them, and how to write your own.

## The `TenantResolver` Interface

Every resolution strategy implements one method:

```typescript
export interface TenantResolver {
  resolve(request: any): Promise<string | undefined>;
}
```

Return the resolved tenant id, or `undefined` if this resolver can't determine one from the given request. Returning `undefined` is not an error — it just means `TenantMiddleware` moves on to the next resolver in the chain.

## How `TenantMiddleware` Chains Resolvers

```typescript
async use(req: any, res: any, next: NextFunction): Promise<void> {
  for (const resolver of this.resolvers) {
    const tenantId = await resolver.resolve(req);
    if (tenantId) {
      TenantContext.set(tenantId);
      break;
    }
  }

  if (this.required && !TenantContext.get()) {
    throw new BadRequestException("Tenant context required but not found");
  }

  await next();
}
```

Two things follow directly from this loop:

- **Order matters.** Resolvers are tried in the exact order you pass them in `TENANT_RESOLVERS`, and the *first* one to return a truthy value wins — later resolvers in the array are never even called for that request.
- **It's all-or-nothing per request.** There's no merging or "most specific wins" logic across resolvers — whichever one resolves first sets the tenant for the rest of the request.

This means the order you register resolvers in is itself a security and correctness decision, not just a style choice. Put your strongest-trust resolver first.

## Built-in Resolvers

### 1. `HeaderTenantResolver`

Reads a tenant id straight from a request header.

```typescript
import { HeaderTenantResolver } from "@nyalajs/tenancy";

new HeaderTenantResolver(); // defaults to header "x-tenant-id"
new HeaderTenantResolver("x-org-id"); // custom header name
```

Source behavior, in full:

```typescript
async resolve(request: any): Promise<string | undefined> {
  if (request.headers?.authorization) {
    return undefined;
  }
  return request.headers[this.headerName];
}
```

The important detail: **it refuses to resolve anything if the request carries an `Authorization` header.** That's a deliberate guard rail, not an oversight — a client-supplied header is trivially spoofable (`X-Tenant-ID: any-other-tenant`), so it's only safe to trust for *unauthenticated* traffic, such as a public signup page picking a tenant by subdomain before a session exists. Once a request is authenticated (bearer token present), tenant identity must come from something the server verified — i.e. the JWT — not a header the caller wrote themselves. That's exactly what pairing `HeaderTenantResolver` before `JwtTenantResolver` in your resolver list gives you: unauthenticated requests can still specify a tenant via header, while authenticated requests are forced onto the verified path.

**When to use it:** internal/service-to-service calls, admin tooling, local development, or public pre-auth flows (e.g. a "choose your workspace" screen) where the header is either fully trusted infrastructure or genuinely low-stakes.

### 2. `SubdomainTenantResolver`

Extracts the tenant identifier from the request's `Host` header.

```typescript
import { SubdomainTenantResolver } from "@nyalajs/tenancy";

new SubdomainTenantResolver();
```

Source behavior:

```typescript
async resolve(request: any): Promise<string | undefined> {
  const host = request.headers.host;
  if (!host) return undefined;

  const parts = host.split(".");
  if (parts.length < 3) return undefined; // No subdomain

  return parts[0];
}
```

For `acme.yoursaas.com`, this resolves to `"acme"`. For a bare `yoursaas.com` or `localhost:3000` (2 parts, or 1), it resolves to `undefined` and falls through to the next resolver.

**This is important and easy to miss:** the resolver returns the raw subdomain label — it does **not** look anything up in a database. If your tenant ids are UUIDs (as in the `tenants` table shown in [Overview](./overview)), the raw string `"acme"` from `SubdomainTenantResolver` will not equal any `tenant_id` column value, and every tenant-scoped query will come back empty. You have two options:

- Make the subdomain slug the actual value stored in `tenant_id` on your rows (simplest, but couples your primary key to a public-facing string), or
- Write a custom resolver that looks the slug up and returns the tenant's real id (see [Writing a Custom Resolver](#writing-a-custom-resolver) below) — this is the more common production choice.

**When to use it:** the standard choice for SaaS products where each tenant gets `<slug>.yourapp.com`. It's the `TENANT_RESOLUTION_STRATEGY=subdomain` default in the SaaS starter template.

### 3. `JwtTenantResolver`

Extracts the tenant id from the `tenantId` claim of a verified JWT.

```typescript
import { JwtTenantResolver } from "@nyalajs/tenancy";
import { JwtStrategy } from "@nyalajs/security";

new JwtTenantResolver(jwtStrategy); // requires a constructed JwtStrategy
```

Source behavior:

```typescript
async resolve(request: any): Promise<string | undefined> {
  const token = this.extractToken(request);
  if (!token) return undefined;

  const identity = await this.jwtStrategy.authenticate(token);
  return identity?.tenantId;
}

private extractToken(request: any): string | null {
  const authHeader = request.headers?.authorization;
  if (!authHeader) return null;

  const [type, token] = authHeader.split(" ");
  return type === "Bearer" ? token : null;
}
```

A few things worth understanding precisely here:

- It reads `Authorization: Bearer <token>` itself — it does **not** depend on `AuthGuard` having already run. Tenant resolution happens in global middleware, which runs *before* per-route guards, so `JwtTenantResolver` verifies the token independently via `jwtStrategy.authenticate(token)`.
- `authenticate()` returns a `UserIdentity` (`{ userId, roles, permissions, tenantId?, metadata }`) built from the JWT payload — the resolver just reads `identity?.tenantId` off it. That means the JWT **must** have been signed with a `tenantId` claim in the first place (e.g. via `jwtStrategy.sign({ sub, tenantId, roles })` at login time). If your tokens don't carry a `tenantId` claim, this resolver always returns `undefined`.
- If the token is invalid or expired, `authenticate()` returns `null`, `identity?.tenantId` is `undefined`, and resolution silently falls through to the next resolver (or to the `TENANT_REQUIRED` check) — it does not throw here. Actual "your token is invalid" errors surface later when `AuthGuard` runs.

**When to use it:** any authenticated route where a user is fundamentally scoped to one tenant per session — the common case for SaaS apps. Combine it with `HeaderTenantResolver` (put the JWT resolver first) so unauthenticated requests still fail closed rather than silently reading an untrusted header.

## Choosing a Strategy

| Strategy | Trust level | Good for | Watch out for |
|---|---|---|---|
| `SubdomainTenantResolver` | Medium — DNS-level | Marketing-friendly SaaS URLs (`acme.app.com`) | Raw label, not a validated id — needs a slug→id mapping in most schemas |
| `HeaderTenantResolver` | Low — client-controlled | Unauthenticated/public flows, internal services | Refuses to run if `Authorization` is present — by design |
| `JwtTenantResolver` | High — server-verified | Authenticated API routes | JWT must be signed with a `tenantId` claim; falls through silently on invalid/missing tokens |

Most production apps register more than one, ordered from most- to least-trusted for the traffic they actually see:

```typescript
{
  provide: "TENANT_RESOLVERS",
  useFactory: (jwtStrategy: JwtStrategy) => [
    new JwtTenantResolver(jwtStrategy),   // authenticated requests: verified claim wins
    new SubdomainTenantResolver(),        // unauthenticated requests: derive from host
    new HeaderTenantResolver(),           // last resort: internal/dev tooling
  ],
  inject: [JwtStrategy],
}
```

## Writing a Custom Resolver

Because `TenantResolver` is a one-method interface, adding a strategy the built-ins don't cover — like the domain-based lookup mentioned in [Overview](./overview) — is a small class:

```typescript
import { Injectable } from "@nyalajs/core";
import { TenantResolver } from "@nyalajs/tenancy";
import { TenantsRepository } from "../app/repositories/tenants.repository";

/**
 * Resolves a tenant from a fully custom domain (e.g. billing.acme-corp.com
 * mapped to tenant "acme" in the `domain` column), rather than a
 * subdomain of your own base domain.
 */
@Injectable()
export class DomainTenantResolver implements TenantResolver {
  constructor(private readonly tenantsRepo: TenantsRepository) {}

  async resolve(request: any): Promise<string | undefined> {
    const host = request.headers?.host;
    if (!host) return undefined;

    const tenant = await this.tenantsRepo.findByDomain(host);
    return tenant?.id;
  }
}
```

And the same pattern covers the "slug subdomain → real tenant id" translation flagged above:

```typescript
@Injectable()
export class SlugSubdomainResolver implements TenantResolver {
  constructor(private readonly tenantsRepo: TenantsRepository) {}

  async resolve(request: any): Promise<string | undefined> {
    const host = request.headers?.host;
    if (!host) return undefined;

    const parts = host.split(".");
    if (parts.length < 3) return undefined;

    const tenant = await this.tenantsRepo.findBySlug(parts[0]);
    return tenant?.id;
  }
}
```

Register it in `TENANT_RESOLVERS` exactly like the built-ins — `TenantMiddleware` has no special-cased handling for the shipped resolvers, it just calls `.resolve(request)` on whatever `TenantResolver[]` you give it.

```typescript
{
  provide: "TENANT_RESOLVERS",
  useFactory: (tenantsRepo: TenantsRepository) => [
    new SlugSubdomainResolver(tenantsRepo),
  ],
  inject: [TenantsRepository],
}
```

## Debugging Resolution Failures

Because `resolve()` failures are silent by design (returning `undefined` is the normal "not this one" signal), the only place a resolution problem becomes visible is the `TENANT_REQUIRED` check at the end of `TenantMiddleware.use()`, which throws a generic `BadRequestException("Tenant context required but not found")`. When you get that error and expect a tenant to have resolved, check in this order:

1. Is the resolver that *should* match this request actually first in `TENANT_RESOLVERS`, ahead of one that might swallow it (e.g. a `HeaderTenantResolver` returning `undefined` because `Authorization` was present, when you expected `JwtTenantResolver` to have already matched)?
2. For `SubdomainTenantResolver`: does the `Host` header actually have 3+ dot-separated parts? `localhost:3000` and bare custom domains never match.
3. For `JwtTenantResolver`: does the JWT payload actually include a `tenantId` claim? A validly-signed token with no `tenantId` claim resolves to `undefined`, not an error.

## Host-Parsing Edge Cases for `SubdomainTenantResolver`

Since `SubdomainTenantResolver` only does `host.split(".")` and checks `parts.length < 3`, it's worth knowing exactly which hosts resolve and which don't before you rely on it in production:

| `Host` header | `parts` | Resolves to |
|---|---|---|
| `acme.yoursaas.com` | `["acme", "yoursaas", "com"]` | `"acme"` |
| `app.acme.yoursaas.com` | `["app", "acme", "yoursaas", "com"]` | `"app"` (not `"acme"` — always takes index 0) |
| `yoursaas.com` | `["yoursaas", "com"]` | `undefined` (falls through) |
| `localhost:3000` | `["localhost:3000"]` | `undefined` (falls through) |
| `acme.localhost:3000` | `["acme", "localhost:3000"]` | `undefined` — only 2 parts, port isn't stripped |

Two practical consequences:

- **Local development against `acme.localhost:3000` won't resolve a tenant** through this resolver, because the port suffix keeps the header at two dot-separated parts. If you need subdomain resolution locally, either test against a `.test`/`.local` domain with a hosts-file entry that has three real labels (`acme.myapp.test`), or fall back to `HeaderTenantResolver` in development via a resolver order like `[SubdomainTenantResolver, HeaderTenantResolver]`.
- **It always takes `parts[0]`**, so a request through a nested subdomain (`app.acme.yoursaas.com`) resolves to `"app"`, not `"acme"`. If your infrastructure ever puts something other than the tenant slug directly in front of your base domain, this resolver will silently resolve the wrong value rather than fail — there's no validation against a known list of tenants at this layer (see the slug→id note above for why you likely want a custom resolver doing a real lookup anyway).

## Resolver Order and `AuthGuard`

It's easy to assume tenant resolution and authentication happen in some coordinated sequence, but they're two independent mechanisms that both read the `Authorization` header on their own terms:

- `TenantMiddleware` runs as **global middleware**, which executes before per-route guards.
- `AuthGuard` (from `@nyalajs/security`) runs as a **guard**, scoped to the routes it's applied to, after global middleware.
- `JwtTenantResolver` does not call `AuthGuard` and doesn't share any state with it — it independently calls `jwtStrategy.authenticate(token)` itself, during the middleware phase, before `AuthGuard` ever runs.

The practical implication: by the time `AuthGuard` runs and (for example) populates request-level user info, `TenantContext` has already been set (or the request has already been rejected by `TENANT_REQUIRED`, if applicable). You can safely assume `TenantContext.get()` is stable and available inside guards, interceptors, and handlers — resolution has always already happened by then. The reverse isn't true: don't assume anything `AuthGuard` computes is available *during* resolver execution, since resolvers run first.

## Testing Resolvers in Isolation

Because each resolver is a plain class with one async method, they're straightforward to unit test with a fake request object — no HTTP server needed:

```typescript
import { describe, it, expect } from "vitest";
import { HeaderTenantResolver, SubdomainTenantResolver } from "@nyalajs/tenancy";

describe("HeaderTenantResolver", () => {
  const resolver = new HeaderTenantResolver();

  it("resolves the tenant from x-tenant-id", async () => {
    const request = { headers: { "x-tenant-id": "tenant-a" } };
    await expect(resolver.resolve(request)).resolves.toBe("tenant-a");
  });

  it("refuses to resolve when Authorization is present", async () => {
    const request = {
      headers: { "x-tenant-id": "tenant-a", authorization: "Bearer xyz" },
    };
    await expect(resolver.resolve(request)).resolves.toBeUndefined();
  });
});

describe("SubdomainTenantResolver", () => {
  const resolver = new SubdomainTenantResolver();

  it("extracts the first label of a three-part host", async () => {
    const request = { headers: { host: "acme.yoursaas.com" } };
    await expect(resolver.resolve(request)).resolves.toBe("acme");
  });

  it("returns undefined for a bare base domain", async () => {
    const request = { headers: { host: "yoursaas.com" } };
    await expect(resolver.resolve(request)).resolves.toBeUndefined();
  });
});
```

For `TenantMiddleware` itself, test the chaining behavior directly by passing an array of resolvers and asserting on `TenantContext.get()` after `use()` runs:

```typescript
import { TenantMiddleware } from "@nyalajs/tenancy";
import { TenantContext } from "@nyalajs/core";

it("uses the first resolver that returns a tenant id", async () => {
  const middleware = new TenantMiddleware(
    [
      { resolve: async () => undefined },       // misses
      { resolve: async () => "tenant-a" },       // hits — this one wins
      { resolve: async () => "tenant-b" },       // never called
    ],
    true
  );

  await TenantContext.run(async () => {
    await middleware.use({ headers: {} }, {}, async () => {
      expect(TenantContext.get()).toBe("tenant-a");
    });
  });
});
```

Note that `TenantMiddleware` isn't itself `@Injectable()`-restricted from being constructed with `new` — its `@Inject` decorators only matter when the DI container builds it, so this direct-construction style works fine in unit tests without spinning up a container. Since resolver order is a correctness-critical setting, tests like this are worth writing whenever you add or reorder entries in `TENANT_RESOLVERS`.

## Next Steps

- [Data Isolation](./isolation) — what happens to the resolved tenant id once it's in `TenantContext`
- [Best Practices](./best-practices) — testing resolution and avoiding cross-tenant leaks
