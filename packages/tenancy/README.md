# @nyalajs/tenancy

Multi-tenancy for NyalaJS SaaS applications: resolve which tenant a request belongs to, isolate its data, and — the part most frameworks don't give you — move a tenant between **shared** (row-level `tenant_id` isolation, one database) and **dedicated** (its own physical database) storage live, at runtime, with no redeploy.

## The two isolation modes

| | Shared (default) | Dedicated |
|---|---|---|
| Storage | One database, `tenant_id` column on every tenant-owned table | One tenant, one physical database |
| Enforcement | `@nyalajs/database`'s `Model` auto-scopes every query, fail-closed | Same `Model` classes, routed to that tenant's own connection |
| Cost | Lowest — shared infrastructure | Higher — one connection pool, one database per dedicated tenant |
| When | The default for most tenants | Compliance/data-residency requirements, a premium plan tier, noisy-neighbor concerns |

A tenant's mode is a row in your own database (`TenantRegistry`), not a build-time or per-deployment choice — `TenantMiddleware` checks it on every request, and `TenantMigrationService` moves a tenant between modes live.

## Quick start (shared mode)

```ts
import { Module } from "@nyalajs/core";
import { TenantMiddleware, SubdomainTenantResolver, HeaderTenantResolver } from "@nyalajs/tenancy";

@Module({
  providers: [
    { provide: "TENANT_RESOLVERS", useFactory: () => [new SubdomainTenantResolver(), new HeaderTenantResolver()] },
    { provide: "TENANT_REQUIRED", useValue: true },
    TenantMiddleware,
  ],
})
export class AppModule {}
```

```ts
// bootstrap/main.ts
app.use(app.get(TenantMiddleware));
```

```ts
import { Model, Table, Primary, Column, StringColumn } from "@nyalajs/database";

@Table("users")
export class User extends Model {
  @Primary() @StringColumn() id!: string;
  @Column({ name: "tenant_id" }) tenantId!: string; // this exact property name triggers automatic scoping
  @StringColumn() email!: string;
}

// Every Model.all()/find()/create()/save()/delete() call is now automatically
// scoped to the resolved tenant, and throws if none is active.
```

That's the whole setup for shared mode. Full walkthrough, resolver strategies, and the fail-closed guarantee's exact mechanics: see the docs site's [Multi-Tenancy](https://nyalajs.dev/docs/multi-tenancy/overview) section.

## Dedicated databases

```ts
import { TenantRegistry, TenantConnectionManager } from "@nyalajs/tenancy";

const registry = new TenantRegistry();
const connections = new TenantConnectionManager({ maxOpenConnections: 100 });

// Wire both into TenantMiddleware's 3rd/4th constructor args (both @Optional() —
// omit them entirely and the middleware behaves exactly as it always has).
const middleware = new TenantMiddleware(resolvers, required, registry, connections);

await registry.register({
  id: "acme",
  name: "Acme Corp",
  isolationMode: "dedicated",
  connectionString: process.env.ACME_DATABASE_URL!,
  driver: "pg",
});
```

From here, `TenantMiddleware` handles routing automatically: it resolves the tenant, sees it's dedicated, gets (or lazily opens, then pools/reuses) its connection via `TenantConnectionManager`, and runs the rest of the request inside `@nyalajs/database`'s `ConnectionContext` — every `Model` call in your handler transparently targets `acme`'s own database. No dedicated-mode-specific repository or query code; the same `Model` classes work unmodified for both modes.

## Migrating a tenant live

```ts
import { TenantMigrationService } from "@nyalajs/tenancy";
import { User, Order, Invoice } from "../app/models";

const migrations = new TenantMigrationService(registry, connections);

// Upgrade: shared -> dedicated
await migrations.migrateToDedicated({
  tenantId: "acme",
  connectionString: process.env.ACME_DATABASE_URL!,
  driver: "pg",
  models: [User, Order, Invoice], // every tenant-scoped Model to move
  onProgress: (table, count) => console.log(`${table}: ${count} rows copied`),
});

// Downgrade: dedicated -> shared
await migrations.migrateToShared({ tenantId: "acme", models: [User, Order, Invoice] });
```

Both directions: provision/verify the target's schema, copy every listed table's rows in batches (reusing `Model`'s own tenant-scoped read/write path — no hand-written `WHERE`/stamping logic), verify the row counts match on both sides, then atomically flip the tenant's registry entry. **A verification mismatch aborts before cutover** — the tenant stays on its current, working connection; live traffic is never routed to an unverified/incomplete target. The source side is never deleted automatically, in either direction.

## What's included

- `TenantMiddleware` — resolves the tenant (via pluggable `TenantResolver`s) and publishes it through `TenantContext`; optionally routes dedicated tenants through `ConnectionContext` too.
- `SubdomainTenantResolver`, `HeaderTenantResolver`, `JwtTenantResolver` — three real resolution strategies, tried in the order you configure them.
- `TenantRegistry` — CRUD + cached lookup over a real `TenantRecord` table (`nyala_tenants`), the source of truth for each tenant's isolation mode.
- `TenantConnectionManager` — pooled, lazily-opened dedicated-tenant connections with LRU eviction and idle sweeping.
- `TenantMigrationService` — live shared↔dedicated migration with schema provisioning, batched row copy, verification, and atomic cutover.
- `TenantRepository<T>` — an abstract, `Model`-backed base class for hand-written tenant-scoped repositories that want guard helpers (`ensureTenant()`/`getTenantId()`) without reimplementing `Model`'s own scoping.

## What's NOT included

- **No schema-per-tenant mode** — only shared (row-level) and dedicated (database-per-tenant) are built in. If you need Postgres `search_path`-based schema switching, you'd wire that yourself, similarly to how dedicated-mode connection routing works.
- **No cross-database joins** — a dedicated tenant's data lives in a separate physical database; there's no query layer here that spans a dedicated tenant's database and the shared one in a single query.
- **No automatic schema-drift detection** between your Model definitions and an already-provisioned dedicated database (`autoCreateSchema: false` trusts the target as-is).
