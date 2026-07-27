# Best Practices

[Data Isolation](./isolation) covered exactly what the framework enforces automatically. This page is about the gap around that guarantee — what's genuinely automatic, what silently bypasses it, and how to test and migrate a multi-tenant schema with confidence.

## What the Framework Actually Enforces

Keep this distinction sharp, because it's the source of most real-world tenant leaks:

**Enforced automatically, for any `Model` with a `tenantId` column:**
- Reads (`all()`, `find()`) are filtered to the current tenant
- Writes (`create()`) are auto-stamped with the current tenant
- Updates/deletes (`save()`, `delete()`) are filtered to the current tenant
- Missing tenant context throws, rather than silently returning unscoped data

**Not enforced by the framework — entirely your responsibility:**
- Raw Drizzle/SQL queries that don't go through `Model`
- Anything you build on `TenantRepository` (only guard helpers are provided — see [Data Isolation](./isolation))
- Cross-table consistency (a `tenant_id` foreign key pointing at the *right* tenant's parent row)
- Seed scripts and factories that construct data outside of an active `TenantContext`
- Ensuring `TenantMiddleware` actually runs before the code path in question

## Pitfall: Raw Queries Bypass Everything

The single most common way tenant isolation breaks is dropping down to a raw query for "just this one case" — a report, an admin screen, a quick fix — and forgetting that raw queries get none of `Model`'s protection.

```typescript
// DANGEROUS — completely bypasses tenant scoping.
// No WHERE tenant_id clause, no fail-closed check, nothing.
import { db } from "../database/connection";
const allInvoices = await db.select().from(invoices);
```

```typescript
// SAFE — goes through Model, gets automatic scoping and the
// fail-closed guarantee if no tenant is active.
const invoices = await Invoice.all();
```

The rule of thumb: if a table has a `tenantId` column, every query against it in request-serving code paths should go through that model's `Model` methods (or a repository built explicitly on top of them), never a raw `db.select()`/`db.insert()` call. If you genuinely need a raw query for performance reasons, add the tenant filter by hand and treat it as a reviewed exception, not a default.

## Pitfall: Deliberate Cross-Tenant Access Needs Its Own Escape Hatch

Sometimes you *do* need cross-tenant access — a superadmin dashboard, platform-wide billing reconciliation, support tooling. Because `Model` has no "admin mode" flag, the only way to legitimately query across tenants is to bypass `TenantContext` scoping on purpose, in code that's clearly marked as doing so:

```typescript
@Injectable()
export class AdminReportingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Deliberately unscoped — for internal admin tooling only.
   * Never expose this path behind a route that ordinary tenant users can reach.
   */
  async getAllTenantsInvoiceTotals() {
    return this.db.getDb().select().from(invoicesTable);
  }
}
```

Guard this kind of method with its own authorization check (e.g. a superadmin-only guard), keep it in a clearly-named service, and never let a regular tenant-facing controller call it. The framework won't stop a legitimately-authorized admin path from reading across tenants — that's by design — but it also won't stop a *mistake* that looks like this, which is why isolating these calls into obviously-named, narrowly-scoped services matters.

## Pitfall: Unique Constraints That Aren't Tenant-Scoped

A `UNIQUE(email)` constraint on a tenant-owned table silently turns into a cross-tenant collision the moment two different tenants both try to use `admin@example.com`. Always scope uniqueness to the tenant:

```typescript
// Wrong — tenant A and tenant B can never both have a user with this email
unique('unique_email').on(table.email)

// Correct — unique per tenant
unique('unique_email_tenant').on(table.tenantId, table.email)
```

This isn't something `Model` can fix for you after the fact — it's a schema decision made at table-definition time.

## Pitfall: Foreign Keys That Cross Tenant Boundaries

A `tenant_id` column on the parent table doesn't automatically stop a row from referencing a *different* tenant's child row through a plain foreign key. If `orders.user_id` references `users.id` with a normal FK, nothing stops an order in tenant A's data from pointing at a user row that belongs to tenant B — the FK only checks that the id exists, not that both rows share a tenant.

Where your schema supports it, prefer a composite foreign key that includes `tenant_id` on both sides, so the database itself rejects a cross-tenant reference:

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL,
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id)
);
```

Where that's impractical, validate tenant ownership in application code before writing the relationship — e.g. confirm `user.tenantId === TenantContext.get()` before attaching a `userId` to a new order.

## Testing Tenant Isolation

Because `TenantContext` is just an `AsyncLocalStorage` cell with `run()`/`set()`/`get()`, you can drive it directly in tests without needing an HTTP request at all:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { Invoice } from "../app/models/invoice.model";

describe("Invoice tenant isolation", () => {
  it("throws when no tenant is active", async () => {
    await expect(Invoice.all()).rejects.toThrow(/Tenant context required/);
  });

  it("only returns the active tenant's rows", async () => {
    await TenantContext.run(async () => {
      TenantContext.set("tenant-a");
      await Invoice.create({ status: "paid" });
    });

    await TenantContext.run(async () => {
      TenantContext.set("tenant-b");
      const invoices = await Invoice.all();
      expect(invoices).toHaveLength(0); // tenant-a's invoice is invisible here
    });
  });

  it("does not leak tenant context between separate ALS scopes", async () => {
    await TenantContext.run(async () => {
      TenantContext.set("tenant-a");
      expect(TenantContext.get()).toBe("tenant-a");
    });

    await TenantContext.run(async () => {
      // A fresh run() scope must not inherit the previous tenant.
      expect(TenantContext.get()).toBeUndefined();
    });
  });
});
```

Each `TenantContext.run()` call opens an isolated `AsyncLocalStorage` scope — nothing carries over from one `run()` to the next, which is exactly what you want for writing tenant-A-then-tenant-B assertions in the same test file without cross-contamination.

For integration tests that go through the HTTP layer instead, drive resolution the same way a real client would — set the header/subdomain/JWT your registered resolvers expect (see [Tenant Resolution](./resolution)) and assert on response bodies, rather than reaching into `TenantContext` directly.

### Testing Factories Under Tenant Scope

`Factory#create()`/`#createMany()` call the model's own `.save()`, which means factory-created records go through the exact same fail-closed check as everything else. Wrap factory calls in `TenantContext.run()` in tests, same as any other `Model` call:

```typescript
await TenantContext.run(async () => {
  TenantContext.set("tenant-a");
  const users = await userFactory.createMany(5);
  // users are all stamped with tenantId: "tenant-a"
});
```

## Seeding and Migrations

### Seeders Run Outside `TenantContext` by Default

`Seeder#run(db)` receives the raw Drizzle database handle directly — not a `Model`-mediated connection — so nothing about seeding is automatically tenant-scoped:

```typescript
export abstract class Seeder {
  abstract run(db: NodePgDatabase): Promise<void>;
}
```

If your seed script uses `db.insert(...)` directly, you must set `tenant_id` explicitly on every row yourself — there's no `TenantContext` to fall back on. If instead you write your seeder using `Model` classes (which do get the fail-closed check), wrap the tenant-scoped portions in `TenantContext.run()`:

```typescript
export class DemoDataSeeder extends Seeder {
  async run(db: NodePgDatabase): Promise<void> {
    // Shared/global rows first — fine outside any tenant context
    const [plan] = await db.insert(plansTable).values({ name: "pro" }).returning();

    // Per-tenant rows need an active TenantContext if you go through Model
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      await TenantContext.run(async () => {
        TenantContext.set(tenantId);
        await User.create({ email: `admin@${tenantId}.test`, name: "Admin" });
      });
    }
  }
}
```

### Migrating an Existing Table to Be Tenant-Scoped

Adding `tenant_id` to a table that already has data needs a backfill before the column can be `NOT NULL`, and the column must land before you add the `@Column` property that turns on `Model`'s automatic scoping — otherwise every existing row is one that no tenant "owns" yet:

```sql
-- 1. Add the column nullable first
ALTER TABLE existing_table ADD COLUMN tenant_id UUID;

-- 2. Backfill based on whatever ownership signal you actually have
UPDATE existing_table SET tenant_id = <derived-tenant-id>;

-- 3. Only now make it NOT NULL
ALTER TABLE existing_table ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Add the FK and index
ALTER TABLE existing_table
    ADD CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
CREATE INDEX idx_existing_table_tenant ON existing_table(tenant_id);
```

Only add the `@Column tenantId` property to the corresponding `Model` class **after** the backfill lands and the column is `NOT NULL` in the database. If you add the property first, any `Model.create()` call in code that's already deployed will suddenly require an active `TenantContext` (via the fail-closed check) for a table that previously didn't need one — which is usually the correct end state, but should be a deliberate, coordinated change, not a side effect of an unrelated deploy.

### Index Every `tenant_id` Column

Every automatically-scoped query adds a `WHERE tenant_id = ...` (and composite `WHERE id = ... AND tenant_id = ...`) predicate. Without an index, that's a sequential scan on every single tenant-scoped query in the app as tables grow:

```typescript
(table) => ({
  tenantIdx: index('invoices_tenant_idx').on(table.tenantId),
})
```

## Pitfall: `@Cacheable` Has No Tenant Awareness

`@nyalajs/cache`'s `@Cacheable()` decorator caches a method's return value under a plain string key — by default `ClassName.methodName`, or whatever you pass explicitly:

```typescript
@Cacheable("users.all", 300)
async findAll() { /* ... */ }
```

That key has no tenant dimension at all. If `findAll()` is tenant-scoped (backed by `Model`), the **first** tenant to call it populates the cache entry, and every other tenant that calls it within the TTL gets served *that first tenant's* cached result — a direct cross-tenant data leak, and a particularly dangerous one because nothing throws or logs an error; it just quietly returns the wrong data.

```typescript
// DANGEROUS on a tenant-scoped method — one shared cache entry for every tenant
@Cacheable("users.all", 300)
async findAll() {
  return User.all();
}

// SAFE — tenant id is part of the cache key
@Cacheable() // falls back to `ClassName.methodName`, still not tenant-safe by itself
async findAll() {
  return User.all();
}

// Actually safe: include the tenant in the key yourself
async findAll() {
  const tenantId = TenantContext.get();
  const cacheKey = `users.all:${tenantId}`;
  const cached = await this.cacheService.get(cacheKey);
  if (cached !== null) return cached;

  const result = await User.all();
  await this.cacheService.set(cacheKey, result, 300);
  return result;
}
```

Treat `@Cacheable` on any method that reads from a tenant-scoped `Model` as unsafe by default. Either avoid the decorator on those methods and manage the cache key manually (including `TenantContext.get()` in it), or don't cache tenant-scoped reads at all unless you've verified the key is tenant-qualified.

## Performance Considerations

- **Index every `tenant_id` column** (see above) — this is the single highest-impact thing you can do, since it's on the hot path of nearly every query `Model` issues once a table is tenant-scoped.
- **Composite indexes for common tenant-scoped lookups.** If you frequently query `WHERE tenant_id = ? AND email = ?`, a composite index on `(tenant_id, email)` serves both the lookup and the tenant-scoped uniqueness constraint from the same index.
- **Avoid joins across tenant-scoped tables without matching both tenant ids.** A join on `orders.user_id = users.id` alone can produce cross-tenant row combinations if the underlying data is ever inconsistent (see the foreign key pitfall above); joining on `(tenant_id, user_id) = (tenant_id, id)` is both a correctness and a performance win, since the query planner can use the composite index.
- **Batch tenant-aware work carefully.** A background job that iterates "for every tenant, do X" needs its own `TenantContext.run()` scope per tenant — sharing one `TenantContext.run()` across a loop over multiple tenants and calling `.set()` repeatedly works too (each `.set()` overwrites the store within the same `run()`), but reusing a single long-lived scope makes it easy to introduce a bug where a slow async operation from tenant A's iteration reads tenant B's id because the loop already moved on and called `.set()` again. Prefer a fresh `TenantContext.run()` per tenant in batch jobs, mirroring how each HTTP request gets its own scope.

## Code Review Checklist for Tenant-Scoped Changes

When reviewing a PR that touches a tenant-owned table, look specifically for:

- Any new `db.select()`/`db.insert()`/`db.update()`/`db.delete()` call that bypasses `Model` — ask whether it's a deliberate, authorized cross-tenant path (and is it in a file/service named to reflect that), or a mistake.
- Any new `@Cacheable()` on a method whose result touches a tenant-scoped `Model`, without a tenant id in the cache key.
- Any new unique or foreign key constraint on a tenant-owned table that doesn't include `tenant_id`.
- Any new `Model` class with a column that clearly represents tenant ownership but isn't named `tenantId` (only that exact property name triggers scoping — a column named `orgId` or `accountId` will silently *not* be scoped, no matter how much it looks like a tenant reference).
- Any new seed/factory code that calls `Model` methods without an enclosing `TenantContext.run()`.

## Audit Trails Need the Same Bridging as `TenantRepository`

If you use `@nyalajs/audit`'s `AuditInterceptor` alongside `@nyalajs/tenancy`, know that it logs `tenantId: reqContext.tenantId` — reading from the same `REQUEST_CONTEXT` object described in [Data Isolation](./isolation). That field is only set by `AuthGuard` from a JWT `tenantId` claim; `TenantMiddleware` never populates it (it only sets the separate `TenantContext` `AsyncLocalStorage`). So if your tenant resolution comes from `TenantMiddleware`'s header/subdomain resolvers rather than a JWT claim via `AuthGuard`, every audit log entry will have `tenantId: undefined`, which quietly defeats the point of an audit trail on a multi-tenant system — you'd have no way to tell which tenant a logged action belonged to. If you rely on audit logs for compliance or incident response, verify this field is actually populated in a real request before trusting it, and add the bridging middleware from [Data Isolation](./isolation) if it isn't.

## Don't Trust Client Input for Tenant Identity Once Authenticated

This is really a restatement of what `HeaderTenantResolver` already enforces (it refuses to run when `Authorization` is present — see [Tenant Resolution](./resolution)), but it's worth stating as a standalone rule because it's easy to violate accidentally in application code, not just in resolver configuration: never accept a `tenantId` field from a request body or query string as the source of truth for which tenant to write data into. Always derive it from `TenantContext.get()` (populated from a verified source — JWT claim, DNS-level subdomain, etc.), never from something the caller wrote in the payload:

```typescript
// DANGEROUS — trusts the client to say which tenant this belongs to
async createInvoice(dto: CreateInvoiceDto) {
  return Invoice.create({ tenantId: dto.tenantId, ...dto });
}

// SAFE — Model.create() auto-stamps the current tenant; never accept it from the client
async createInvoice(dto: CreateInvoiceDto) {
  return Invoice.create({ ...dto }); // tenantId comes from TenantContext, not dto
}
```

Recall from [Data Isolation](./isolation) that `stampTenant()` only auto-fills `tenantId` when the payload doesn't already have one — so if your DTO happens to include a `tenantId` field and you spread it into `create()`, you silently disable the auto-stamp and let the caller pick the tenant. Keep `tenantId` out of your create/update DTOs entirely for tenant-scoped resources.

## Quick Checklist

- Every tenant-owned table has a `tenantId` property on its `Model` class, backed by a `NOT NULL`, indexed, foreign-keyed `tenant_id` column
- No request-serving code path queries a tenant-owned table with a raw `db.select()`/`db.insert()` instead of `Model`
- Unique constraints on tenant-owned tables are composite with `tenant_id`, not global
- Cross-table relationships either use composite tenant-aware foreign keys or are validated in application code
- Deliberate cross-tenant access (admin/reporting) lives in narrowly-scoped, clearly-named, separately-authorized services — never in a path a regular tenant user can reach
- Tests exercise both "tenant A can't see tenant B's data" and "no tenant active throws," using `TenantContext.run()`/`set()` directly
- Seed scripts either avoid `Model` for cross-tenant rows or wrap tenant-owned inserts in `TenantContext.run()`
- Schema migrations that add `tenant_id` backfill and constrain the column *before* the `Model` class starts requiring it

## Next Steps

- [Data Isolation](./isolation) — the exact mechanics behind every rule above
- [Tenant Resolution](./resolution) — where the `TenantContext` these rules depend on actually comes from
