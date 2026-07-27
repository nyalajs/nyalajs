# Data Isolation

This page explains exactly how Nyala enforces tenant isolation once a tenant id has been resolved — what triggers automatic scoping, what the generated queries actually look like, what happens on a cross-tenant access attempt, and where the repository-based building block (`TenantRepository`) fits in versus the fully-automatic path.

There are two distinct mechanisms in play, and understanding which one you're relying on matters:

1. **`Model` (in `@nyalajs/database`)** — the fully-automatic path. Any model with a `tenantId` column gets scoped queries with zero code in your repository/service layer.
2. **`TenantRepository` (in `@nyalajs/tenancy`)** — a lower-level abstract base for hand-written repositories, providing guard helpers only. It does *not* auto-generate query filters for you, and it reads tenant id from a different context object than `Model` does — details below.

## The Automatic Path: `Model`

### How a Table Becomes Tenant-Scoped

Scoping is driven entirely by schema shape, not configuration. `SchemaRegistry` builds a Drizzle table from your `@Table`/`@Column` decorators, and `TenantScope`/`Model` simply check whether the resulting table object has a `tenantId` key:

```typescript
// packages/database/src/tenancy/tenant-scope.ts
export class TenantScope {
  static getScope(modelClass: any, tenantId: string): SQL | undefined {
    const table = SchemaRegistry.getTable(modelClass);
    if (table.tenantId) {
      return eq(table.tenantId, tenantId);
    }
    return undefined;
  }
}
```

So a model becomes tenant-scoped the moment it has a property named exactly `tenantId`:

```typescript
import { Model, Table, Primary, Column, StringColumn } from "@nyalajs/database";

@Table("invoices")
export class Invoice extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @Column({ name: "tenant_id" })
  tenantId!: string; // <- this property name is what triggers scoping

  @StringColumn()
  status!: string;
}
```

The `name: "tenant_id"` option only controls the physical Postgres column name — the framework's own detection logic keys off the TypeScript property name (`tenantId`), not the database column name.

### What Happens on Every Query

`Model`'s private `requireTenantScope(modelClass)` runs before every read, and `stampTenant(modelClass, data)` before every write:

```typescript
private static requireTenantScope(modelClass: any): SQL | undefined {
  const table = SchemaRegistry.getTable(modelClass);
  if (!table.tenantId) return undefined;

  const tenantId = TenantContext.get();
  if (!tenantId) {
    throw new Error(
      `Tenant context required: ${modelClass.name}'s table has a tenant_id column ` +
      `but no tenant is active for the current request/transaction.`
    );
  }

  return TenantScope.getScope(modelClass, tenantId);
}
```

This is a **fail-closed** policy: it's not "scope if a tenant happens to be set," it's "throw if a tenant-scoped table is touched with no active tenant." There is no way to accidentally run an unscoped query against a tenant-owned table through `Model` — you either get correctly-scoped results, or an exception, never an unfiltered result set.

| Method | Behavior on a tenant-scoped model |
|---|---|
| `Model.all()` | Adds `WHERE tenant_id = <current>` to the `SELECT` |
| `Model.find(id)` | Adds `WHERE id = <id> AND tenant_id = <current>` |
| `Model.create(data)` | Auto-stamps `tenantId` onto the insert payload (unless already set) via `stampTenant()` |
| `instance.save()` (update) | Adds `WHERE id = <id> AND tenant_id = <current>` to the `UPDATE` |
| `instance.delete()` | Adds `WHERE id = <id> AND tenant_id = <current>` to the `DELETE` |

All of it reads from `TenantContext.get()` — the same `AsyncLocalStorage`-backed store that `TenantMiddleware` populates via `TenantContext.set(tenantId)` (see [Tenant Resolution](./resolution)). That's the entire connection between "a request resolved to tenant X" and "every query in this request only sees tenant X's rows": one shared `AsyncLocalStorage` cell, read on one side and written on the other.

### Cross-Tenant Access: What Actually Happens

Two different situations get confused under "cross-tenant protection" — it's worth separating them precisely, because they behave differently:

**Case 1 — a tenant *is* active, but you request a row belonging to a different tenant:**

```typescript
// TenantContext.get() === "tenant-a"
const invoice = await Invoice.find("invoice-owned-by-tenant-b");
// Query: WHERE id = 'invoice-owned-by-tenant-b' AND tenant_id = 'tenant-a'
// → zero rows match → returns null
```

This returns `null`, exactly as if the id didn't exist at all. From the caller's perspective there is no distinguishable difference between "not found" and "belongs to someone else" — which is the correct behavior for avoiding tenant enumeration (see [Overview](./overview) for why leaking existence is itself a security issue).

**Case 2 — no tenant is active at all:**

```typescript
// TenantContext.get() === undefined (middleware didn't run, or TENANT_REQUIRED
// wasn't set and no resolver matched)
const invoices = await Invoice.all();
// Throws: "Tenant context required: Invoice's table has a tenant_id column
//          but no tenant is active for the current request/transaction."
```

This throws rather than silently returning all tenants' rows or an empty array. That's the fail-closed guarantee: an *unset* tenant context is treated as a bug to surface loudly, not a condition to degrade gracefully from.

### Writes Are Scoped Too

`Model.create()` doesn't just filter reads — it stamps `tenantId` onto every insert automatically:

```typescript
private static stampTenant(modelClass: any, data: any): any {
  const table = SchemaRegistry.getTable(modelClass);
  if (!table.tenantId || (data as any).tenantId) return data;

  const tenantId = TenantContext.get();
  if (!tenantId) {
    throw new Error(/* same fail-closed error as reads */);
  }
  return { ...data, tenantId };
}
```

```typescript
// TenantContext.get() === "tenant-b"
const invoice = await Invoice.create({ status: "pending" });
// Inserted row has tenant_id = 'tenant-b', even though you never set it
```

If you pass `tenantId` explicitly, `stampTenant` leaves it alone (`(data as any).tenantId` short-circuits the auto-stamp) — so it's possible to insert a row for a *different* tenant than the current context if your own code explicitly sets `tenantId` on the payload. The framework doesn't guard against that; it only guards against the "forgot to scope entirely" case.

### Transactions Stay Scoped

`DatabaseService.transaction(fn)` propagates the active connection via a separate `TransactionContext` ALS, but it runs `fn` inside the *same* async chain your request is already in — so `TenantContext.get()` still resolves correctly to whatever the middleware set, for every `Model` call made inside the transaction:

```typescript
await databaseService.transaction(async () => {
  const invoice = await Invoice.create({ status: "pending" }); // still tenant-scoped
  await Ledger.create({ invoiceId: invoice.id, amount: 100 });  // also tenant-scoped
});
```

## The Manual Path: `TenantRepository`

`@nyalajs/tenancy` also exports an abstract `TenantRepository<T>` for teams that prefer hand-written repository classes over the `Model` active-record pattern:

```typescript
export abstract class TenantRepository<T> {
  constructor(
    @Inject("REQUEST_CONTEXT") protected readonly ctx: any
  ) {}

  protected ensureTenant(): void {
    if (!this.ctx.tenantId) {
      throw new Error(
        "Tenant context required for this operation. This is a security measure to prevent data leakage."
      );
    }
  }

  protected getTenantId(): string {
    this.ensureTenant();
    return this.ctx.tenantId!;
  }

  abstract find(criteria: any): Promise<T[]>;
  abstract findOne(id: string): Promise<T | null>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract delete(id: string): Promise<void>;
}
```

Read this class carefully, because it's easy to assume more than it does:

- It does **not** implement `find`/`findOne`/`create`/`update`/`delete` — they're `abstract`. It gives you `getTenantId()`/`ensureTenant()` as guard helpers; *you* still have to write the actual Drizzle query and apply the `eq(table.tenantId, this.getTenantId())` filter yourself in every method.
- It reads the tenant id from `this.ctx.tenantId`, where `ctx` is injected via `@Inject("REQUEST_CONTEXT")` — a **different object** from the `TenantContext` `AsyncLocalStorage` that `TenantMiddleware` and `Model` both use. `REQUEST_CONTEXT` is a plain per-request object (`{ requestId, traceId, tenantId?, userId?, locale?, startedAt, metadata }`) that the HTTP adapter constructs at the start of every request.
- There's exactly one place in the framework that writes to `REQUEST_CONTEXT.tenantId`: `AuthGuard` (`@nyalajs/security`), which sets `context.context.tenantId = identity.tenantId` after verifying a JWT — so on a route guarded with `@UseGuards(AuthGuard)`, `getTenantId()` *will* work, but only if the JWT payload itself carries a `tenantId` claim (`JwtStrategy` reads `payload.tenantId`; it's optional and up to whoever signs the token to include it).
- What's still missing: nothing copies the tenant id resolved by `TenantMiddleware` (from a subdomain, header, or other non-JWT resolver — see [Tenant Resolution](./resolution)) onto `REQUEST_CONTEXT.tenantId`. So `TenantRepository.getTenantId()` only works today if you're authenticating with `AuthGuard` and embedding `tenantId` in the JWT yourself; it will throw "Tenant context required for this operation" for any tenant resolved via `TenantMiddleware`'s header/subdomain resolvers instead, unless you bridge the two — for example, with your own middleware/interceptor that does:

  ```typescript
  @Injectable()
  export class BridgeTenantContextMiddleware {
    constructor(@Inject("REQUEST_CONTEXT") private readonly ctx: any) {}

    async use(req: any, res: any, next: NextFunction): Promise<void> {
      this.ctx.tenantId = TenantContext.get();
      await next();
    }
  }
  ```

  registered *after* `TenantMiddleware` in your middleware chain.

Given that gap, most applications get more value out of building on `Model` (which is already wired end-to-end to `TenantContext`) and reserving `TenantRepository` for cases where you specifically need repository-pattern encapsulation and are prepared to wire the bridge above — or to simply call `TenantContext.get()` directly inside your repository instead of going through `this.ctx.tenantId` at all.

## Choosing Between Them

| | `Model` (`@nyalajs/database`) | `TenantRepository` (`@nyalajs/tenancy`) |
|---|---|---|
| Query filtering | Automatic, based on `tenantId` column detection | Manual — you write every `WHERE` clause |
| Tenant source | `TenantContext` (`AsyncLocalStorage`), set by `TenantMiddleware` | `REQUEST_CONTEXT.tenantId`, set only by `AuthGuard` from a JWT `tenantId` claim — not populated by `TenantMiddleware`'s resolvers |
| Fail-closed on missing tenant | Yes, built in | Only if you call `ensureTenant()`/`getTenantId()` yourself |
| Best for | Default choice for tenant-owned tables | Custom repository-pattern codebases with the bridge wired |

## Shared (Non-Tenant) Models

Not every table should be scoped. A `Plan` table listing your product's pricing tiers, for instance, is meant to be visible to every tenant — so its `Model` class simply has no `tenantId` property:

```typescript
@Table("plans")
export class Plan extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @StringColumn()
  name!: string;

  // No tenantId property — Plan.all(), Plan.find(), Plan.create() all run
  // completely unscoped, regardless of the active TenantContext.
}
```

`SchemaRegistry.getTable(Plan)` produces a table object with no `tenantId` key, so `requireTenantScope(Plan)` returns `undefined` immediately (`if (!table.tenantId) return undefined;`) — no fail-closed check, no filtering, no stamping. This works correctly with an active tenant context (queries just ignore it) and with no tenant context at all (nothing throws), which is exactly the behavior a shared table needs.

Be deliberate about which tables fall into this category — leaving `tenantId` off a table by mistake doesn't cause an error anywhere; it just means that table's data is visible to every tenant, silently. There's no framework-level warning for "this table looks like it should probably be tenant-scoped but isn't."

## Using `TenantScope` Directly

For the rare case where you need a tenant filter as a standalone `SQL` condition — say, combining it with other conditions in a query that doesn't go through `Model` — `TenantScope.getScope()` is the same helper `Model` uses internally, and it's exported from `@nyalajs/database`:

```typescript
import { TenantScope } from "@nyalajs/database";
import { TenantContext } from "@nyalajs/core";
import { and, gte } from "drizzle-orm";

const tenantId = TenantContext.get();
if (!tenantId) throw new Error("Tenant context required");

const scope = TenantScope.getScope(Invoice, tenantId); // eq(table.tenantId, tenantId), or undefined
const recentUnpaid = await db
  .select()
  .from(invoicesTable)
  .where(and(scope, gte(invoicesTable.createdAt, cutoffDate)));
```

This is still a manual, opt-in path — reaching for `TenantScope` directly means you've stepped outside `Model`'s automatic, fail-closed handling and are responsible for checking `TenantContext.get()` yourself, exactly as with any other raw query (see [Best Practices](./best-practices) for the risks of raw queries in general).

## Composing With `SoftDeletes`

`@nyalajs/database` also ships a `SoftDeletes` mixin, which composes independently of tenant scoping:

```typescript
import { Model, SoftDeletes, Table, Primary, Column, StringColumn } from "@nyalajs/database";

@Table("invoices")
export class Invoice extends SoftDeletes(Model) {
  @Primary()
  @StringColumn()
  id!: string;

  @Column({ name: "tenant_id" })
  tenantId!: string;
}
```

The mixin overrides `delete()` to set `deletedAt` and call `save()` instead of issuing a real `DELETE` — and since it calls the same underlying `save()`, that call still goes through `Model`'s tenant-scoped `WHERE id = ... AND tenant_id = ...`, so soft-deleting a row you don't own still fails silently the same way a hard delete would (zero rows match, nothing happens).

One thing to know precisely, straight from the source comment on `SoftDeletes`: the mixin does **not** currently filter soft-deleted rows out of `all()`/`find()` automatically — that filtering (`isNull(table.deletedAt)`) is called out in the source as not yet implemented. So today, a soft-deleted row is still tenant-scoped correctly, but it will still show up in `Invoice.all()` results for its owning tenant unless you filter `deletedAt` yourself. Tenant isolation and soft-delete filtering are two independent concerns here — don't assume one implies the other.

## The `REQUEST_CONTEXT.tenantId` Gap Affects More Than `TenantRepository`

The same gap described above for `TenantRepository` — nothing in the framework copies `TenantContext.get()` onto `REQUEST_CONTEXT.tenantId` — also affects `@nyalajs/audit`'s `AuditInterceptor`, which logs `tenantId: reqContext.tenantId` on every auditable request:

```typescript
// packages/audit/src/audit.interceptor.ts
await this.auditLogger.log({
  actorId: reqContext.userId ?? "anonymous",
  tenantId: reqContext.tenantId, // reads the same REQUEST_CONTEXT object
  // ...
});
```

If you use `@nyalajs/audit` alongside `@nyalajs/tenancy`, your audit trail's `tenantId` field will be `undefined` on every entry unless you add the same bridging middleware described above (copying `TenantContext.get()` onto the request-scoped `REQUEST_CONTEXT` object). This is worth checking directly in your own setup — the two packages don't currently connect this field automatically.

## Mental Model: How the Pieces Connect

```
Request arrives
    │
    ▼
FastifyAdapter wraps the whole request in TenantContext.run(...)
    │
    ▼
TenantMiddleware (global middleware, from @nyalajs/tenancy)
    │  tries each TenantResolver in TENANT_RESOLVERS, in order
    ▼
TenantContext.set(tenantId)   ← the ONE shared AsyncLocalStorage cell
    │
    ▼
Guards / Interceptors / Controller handler run
    │
    ▼
Service calls a Model method (User.all(), Invoice.create(), ...)
    │
    ▼
Model.requireTenantScope() / stampTenant()
    │  reads TenantContext.get()
    │  looks up table.tenantId via SchemaRegistry
    ▼
TenantScope.getScope() → eq(table.tenantId, tenantId)
    │
    ▼
Scoped query sent to Postgres
```

The only thing connecting resolution (`TenantMiddleware`) to enforcement (`Model`) is that one `TenantContext.get()`/`.set()` pair — there's no other coupling, no shared config object, no event system between the two packages. That's also exactly why `TenantRepository` (which reads `REQUEST_CONTEXT.tenantId` instead) doesn't participate in this chain unless you bridge it explicitly, as described above.

## Next Steps

- [Best Practices](./best-practices) — what the framework enforces vs. what's still your responsibility, plus testing isolation directly
- [Tenant Resolution](./resolution) — how `TenantContext` gets populated in the first place
