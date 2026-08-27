# Multi-Tenancy Overview

Nyala provides built-in multi-tenancy support for building SaaS applications with automatic data isolation, in two modes you can mix per tenant: **shared** (row-level `tenant_id` isolation, one database) and **dedicated** (one tenant, one physical database) — switchable live, per tenant, with `@nyalajs/tenancy`'s `TenantMigrationService`, no redeploy required.

## What is Multi-Tenancy?

Multi-tenancy allows a single application instance to serve multiple customers (tenants), with each tenant's data completely isolated from others.

### Use Cases

- **SaaS Applications**: Serve multiple customers from one codebase
- **B2B Platforms**: Separate data for each business customer
- **Agency Platforms**: Manage multiple client accounts
- **Educational Platforms**: Isolate schools or institutions
- **Enterprise/regulated customers**: Give a specific large customer (compliance requirement, noisy-neighbor concern, or contractual data-residency clause) their own dedicated database, without forking your application or maintaining a second codebase

## Key Features

### Automatic Data Isolation

No manual tenant filtering required — the `Model` active-record base class (`@nyalajs/database`) scopes every query automatically for a table with a `tenantId` column:

```typescript
// Model queries automatically scope to the current tenant
const users = await User.all();
// Only returns the current tenant's users — a WHERE tenant_id = ... clause
// was added for you, and this throws if no tenant is active at all
// (fail-closed, not silently unscoped). See ./isolation for the full detail.
```

### Tenant Context

Automatic tenant resolution from requests, via `TenantMiddleware`:

```typescript
// Tenant extracted from header, subdomain, or JWT by TenantMiddleware,
// then published via TenantContext (an AsyncLocalStorage-backed store)
// before your handler runs.
@Get('/users')
async getUsers() {
  return this.usersService.findAll(); // reads whatever TenantContext resolved
}
```

### Cross-Tenant Protection

Built-in fail-closed scoping in `Model` prevents cross-tenant access:

```typescript
// Cannot access another tenant's row even with its real id
const user = await User.find('other-tenant-user-id');
// Returns null — same as "not found", so existence isn't leaked either.
```

## Architecture

```
Request with Tenant ID
    ↓
TenantMiddleware (@nyalajs/tenancy) — resolves the tenant
    ↓
TenantContext (@nyalajs/core) — AsyncLocalStorage, holds the current tenant id
    ↓
   ├─ shared tenant → Model reads/writes the app's normal global connection,
   │                  auto-filtered by tenant_id (row-level isolation)
   │
   └─ dedicated tenant → TenantRegistry says "dedicated" → TenantConnectionManager
                          gets/opens that tenant's own connection →
                          ConnectionContext (@nyalajs/database) routes every
                          Model call in this request to it — same Model code,
                          different physical database
```

Which branch a given request takes is decided per-tenant, at request time, by `TenantMiddleware` consulting `TenantRegistry` — not a build-time or per-deployment choice. See [Data Isolation](./isolation) for the shared-mode mechanism in full detail, and [Dedicated Databases](#dedicated-database-per-tenant) below for the dedicated-mode one.

## Quick Start

### 1. Use SaaS Template

```bash
nyala new my-saas --template=saas
```

### 2. Define a Tenant-Scoped Model

```typescript
import { Model, Table, Primary, Column, StringColumn } from "@nyalajs/database";

@Table("users")
export class User extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @Column({ name: "tenant_id" })
  tenantId!: string; // this exact property name is what triggers automatic scoping

  @StringColumn()
  email!: string;
}
```

### 3. Register Resolvers and Mount the Middleware

```typescript
// bootstrap/app.module.ts
import { Module } from "@nyalajs/core";
import { TenantMiddleware, SubdomainTenantResolver, HeaderTenantResolver } from "@nyalajs/tenancy";

@Module({
  providers: [
    {
      provide: "TENANT_RESOLVERS",
      useFactory: () => [new SubdomainTenantResolver(), new HeaderTenantResolver()],
    },
    { provide: "TENANT_REQUIRED", useValue: true },
    TenantMiddleware,
  ],
})
export class AppModule {}
```

```typescript
// bootstrap/main.ts
app.use(app.get(TenantMiddleware));
```

That's the whole setup for shared-mode isolation — see [Setup](./setup) for the complete walkthrough, including where exactly the middleware attaches. Dedicated-database tenants need two more providers wired in; see [Setup](./setup#dedicated-database-tenants) for that.

## Tenant Resolution Strategies

`@nyalajs/tenancy` ships three real `TenantResolver` implementations, tried in the order you list them in `TENANT_RESOLVERS` — the first one to return a tenant id wins (see [Tenant Resolution](./resolution) for the full detail on each, including the security reasoning behind why `HeaderTenantResolver` refuses to run on an authenticated request):

### 1. Header-Based (`HeaderTenantResolver`)

```typescript
// Client sends: x-tenant-id: acme
// Only used for UNAUTHENTICATED requests — refuses to resolve anything
// once an Authorization header is present, since a client-controlled
// header must never be trusted to pick a tenant post-login.
```

### 2. Subdomain-Based (`SubdomainTenantResolver`)

```typescript
// acme.myapp.com -> "acme"
```

### 3. JWT-Based (`JwtTenantResolver`)

```typescript
// Decodes and verifies the bearer token itself (independent of AuthGuard,
// since tenant resolution runs as global middleware before any per-route
// guard), reading the tenantId claim from the verified payload.
```

Write a custom `TenantResolver` (implement `resolve(request): Promise<string | undefined>`) only for a strategy these three don't cover — e.g. a custom domain mapped to a tenant via a database lookup.

## Data Isolation Modes

### Row-Level / Shared (Default)

One database, a `tenant_id` column on every tenant-owned table, automatic filtering via `Model`:

```typescript
@Column({ name: "tenant_id" })
tenantId!: string;

// Every Model.all()/find()/create()/save()/delete() call is scoped to
// TenantContext.get() automatically — see ./isolation for the exact
// WHERE clauses and fail-closed behavior.
```

**Pros**: Simple, cost-effective, easy to scale to many small tenants on shared infrastructure.
**Cons**: All tenants share the same physical database's resource limits and blast radius.

### Dedicated Database Per Tenant

One tenant, one physical database — real, built-in support via `@nyalajs/tenancy`'s `TenantConnectionManager` + `TenantRegistry`, not something you hand-roll:

```typescript
import { TenantRegistry, TenantConnectionManager } from "@nyalajs/tenancy";

// A tenant's isolation mode + connection string live in the tenant registry
// (a real Model-backed table, `nyala_tenants`, in your shared/system DB) —
// looked up by TenantMiddleware on every request, not configured once at
// deploy time.
await tenantRegistry.register({
  id: "acme",
  name: "Acme Corp",
  isolationMode: "dedicated",
  connectionString: process.env.ACME_DATABASE_URL!,
  driver: "pg",
});
```

Once registered, `TenantMiddleware` handles the rest automatically: it looks up `acme`'s isolation mode, gets (or lazily opens, then pools and reuses) its dedicated connection via `TenantConnectionManager`, and runs the rest of that request so every `Model` call transparently targets `acme`'s own database — the exact same `User`/`Order`/etc. Model classes you already wrote, no dedicated-mode-specific repository or query code needed. See [Setup](./setup#dedicated-database-tenants) for the full wiring and [Dedicated Databases](#dedicated-database-per-tenant) below for how connection pooling and eviction work.

**Pros**: Complete physical isolation, independent backup/restore/scaling per tenant, satisfies data-residency or noisy-neighbor requirements a shared table can't.
**Cons**: Higher operational cost per tenant; only worth it for tenants that actually need it (an enterprise plan, a compliance-driven customer) — most SaaS apps keep the bulk of their tenants on shared mode and reserve dedicated for the minority that need it.

### Migrating a Tenant Between Modes, Live

The point of having both modes is being able to move a tenant between them without a redeploy — e.g. upgrading a customer to a paid plan that includes a dedicated database, or downgrading one back to shared:

```typescript
import { TenantMigrationService } from "@nyalajs/tenancy";

// Upgrade: shared -> dedicated
await migrationService.migrateToDedicated({
  tenantId: "acme",
  connectionString: process.env.ACME_DATABASE_URL!,
  driver: "pg",
  models: [User, Order, Invoice], // every tenant-scoped Model to move
});

// Downgrade: dedicated -> shared
await migrationService.migrateToShared({
  tenantId: "acme",
  models: [User, Order, Invoice],
});
```

Both directions: provision/verify the target's schema, copy every listed table's rows in batches (reusing `Model`'s own tenant-scoping — no hand-written `WHERE`/stamping logic), verify the row counts actually match on both sides, and only then flip the tenant's registry entry — the atomic cutover that makes the new connection live for the very next request. The source side is never deleted automatically. See [Setup](./setup#migrating-a-tenant-live) for the full walkthrough, error handling, and what `migrationStatus` values mean.

### Schema Per Tenant (Not Built In)

A third pattern some teams use — separate Postgres schema per tenant within one database (`SET search_path TO tenant_acme`) — sits between row-level and dedicated-database in cost/isolation tradeoff. Nyala doesn't ship built-in support for this mode; if you need it, you'd manage the `search_path` switch yourself around each request (similar in shape to how `TenantMiddleware` switches connections for dedicated mode, but switching a schema search path on a single shared connection instead of opening a new one). Most teams choosing between Nyala's two built-in modes find shared row-level isolation sufficient until a specific tenant's requirements justify a full dedicated database, which is why that's the second mode this framework actually implements rather than schema-per-tenant.

## Benefits

### For Developers

- **Automatic Filtering**: No manual tenant checks in shared mode
- **One Model, Both Modes**: The exact same `Model` classes/repositories work unmodified whether a given tenant is shared or dedicated — isolation mode is a runtime property of the tenant, not a compile-time choice baked into your models
- **Type Safety**: TypeScript throughout
- **Live Migration**: Move a tenant between modes without downtime or a redeploy

### For Businesses

- **Cost Effective**: Shared infrastructure by default, dedicated only where it's actually needed
- **Easy Scaling**: Add tenants without code changes
- **Data Security**: Row-level isolation for most tenants, full physical isolation for the ones that require it
- **Flexible Pricing**: Tie "dedicated database" to a premium plan tier, enforced by an actual live migration, not a manual ops request

## Common Patterns

### Tenant Creation

```typescript
import { Injectable } from "@nyalajs/core";
import { TenantRegistry } from "@nyalajs/tenancy";

@Injectable()
export class TenantsService {
  constructor(private readonly tenantRegistry: TenantRegistry) {}

  async create(dto: { id: string; name: string; adminEmail: string }) {
    const tenant = await this.tenantRegistry.register({
      id: dto.id,
      name: dto.name,
      // isolationMode defaults to "shared" — most new tenants start here
    });

    await TenantContext.run(async () => {
      TenantContext.set(tenant.id);
      await User.create({ email: dto.adminEmail, role: "admin" } as any);
    });

    return tenant;
  }
}
```

### Upgrading a Tenant to Dedicated (Admin Feature)

```typescript
import { Injectable } from "@nyalajs/core";
import { TenantMigrationService } from "@nyalajs/tenancy";

@Injectable()
export class AdminTenantService {
  constructor(private readonly migrations: TenantMigrationService) {}

  async upgradeToDedicated(tenantId: string, connectionString: string) {
    return this.migrations.migrateToDedicated({
      tenantId,
      connectionString,
      driver: "pg",
      models: [User, Order, Invoice],
      onProgress: (table, count) => console.log(`${table}: ${count} rows copied`),
    });
  }
}
```

### Shared Resources

```typescript
// Some tables are shared across every tenant regardless of isolation mode —
// simply omit tenantId. This works identically for shared AND dedicated
// tenants, since Model's scoping is driven by the table's own shape, not
// by which physical database it happens to be connected to.
@Table("plans")
export class Plan extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @StringColumn()
  name!: string;
  // No tenantId column — Plan.all()/find()/create() never filter by tenant.
}
```

## Security Considerations

### 1. Always Rely on `Model`'s Fail-Closed Scoping — Don't Hand-Roll Tenant Checks

```typescript
// Model already throws if no tenant is active, and already scopes the
// query — no manual "does this belong to the current tenant" check needed:
async update(id: string, dto: UpdateDto) {
  const resource = await Invoice.find(id); // null if it's someone else's, or if no tenant is active it THROWS
  if (!resource) throw new NotFoundException();
  Object.assign(resource, dto);
  return resource.save();
}
```

### 2. Index Tenant Columns

```typescript
// tenant_id should always be indexed (and usually the leading column of a
// composite index alongside whatever you query most) — Nyala doesn't
// generate this for you; add it in your own migration.
```

### 3. Treat a Dedicated Tenant's `connectionString` as a Secret

`TenantRegistry` stores it verbatim in the `nyala_tenants` table — encrypt it at rest in production (a secrets manager, or column-level encryption), and never log it. `TenantConnectionManager` never logs connection strings itself.

### 4. Audit Tenant Access

```typescript
import { TenantContext } from "@nyalajs/core";

@Injectable()
export class TenantAuditMiddleware {
  async use(req: any, res: any, next: NextFunction) {
    console.log({
      tenantId: TenantContext.get(),
      path: req.url,
      method: req.method,
      timestamp: new Date(),
    });
    await next();
  }
}
```

## Next Steps

- [Setup](./setup) - Implementation guide, including dedicated-database tenants and live migration
- [Tenant Resolution](./resolution) - Resolution strategies in depth
- [Data Isolation](./isolation) - The shared/row-level mechanism in full detail
- [Best Practices](./best-practices) - Security and performance
