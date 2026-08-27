# Tenancy API

Multi-tenancy API reference. For the full setup walkthrough, see [Multi-Tenancy Setup](../multi-tenancy/setup) — this page is the quick per-symbol reference.

## `TenantContext`

`TenantContext` (from `@nyalajs/core`, not `@nyalajs/tenancy`) is a static, `AsyncLocalStorage`-backed class — not something you inject. `TenantMiddleware` calls `TenantContext.set(tenantId)` once per request after resolving the tenant; everything downstream reads it with `TenantContext.get()`.

```typescript
import { Injectable } from '@nyalajs/core';
import { TenantContext } from '@nyalajs/core';

@Injectable()
export class UsersService {
  getCurrentTenantId(): string | undefined {
    return TenantContext.get();
  }
}
```

`TenantContext.get()` returns `undefined` if no tenant is active for the current request — there's no `getTenant()` returning a full `Tenant` object; if you need more than the ID, look it up yourself (e.g. via a `TenantRepository`-based repository over the `Tenant` model — see [Shared (Non-Tenant-Scoped) Data](#shared-non-tenant-scoped-data) below for why that model isn't itself tenant-scoped).

## `TenantRepository`

Abstract base for tenant-scoped repositories, backed by `@nyalajs/database`'s `Model` (not raw Drizzle tables) — every method delegates to `Model`'s static methods, which already enforce tenant scoping and fail closed when no tenant is active.

```typescript
import { Injectable } from '@nyalajs/core';
import { TenantRepository } from '@nyalajs/tenancy';
import { Table, Primary, Column, StringColumn } from '@nyalajs/database';
import { Model } from '@nyalajs/database';

@Table('invoices')
class Invoice extends Model {
  @Primary() @StringColumn() id!: string;
  @Column({ name: 'tenant_id' }) tenantId!: string;
}

@Injectable()
export class InvoiceRepository extends TenantRepository<Invoice> {
  protected readonly model = Invoice;
}
```

`model` is a class property, not a constructor argument — `TenantRepository` has no constructor of its own to pass a table/context into. Some starter templates (`saas-starter`, `helpdesk-saas`) instead use a hand-rolled `BaseRepository` over raw Drizzle tables that reads `TenantContext` directly; see [Multi-Tenancy Setup](../multi-tenancy/setup#alternative-a-hand-rolled-tenant-aware-repository) for that pattern and when it's used instead of `Model`/`TenantRepository`.

## `TenantMiddleware`

Resolves the tenant for the current request and publishes it via `TenantContext`. Configured with two DI tokens, not a `MiddlewareConsumer.forRoutes()` call (Nyala doesn't have that API) — it's registered globally like any other `Middleware`:

```typescript
import { Module } from '@nyalajs/core';
import { TenantMiddleware, JwtTenantResolver, SubdomainTenantResolver } from '@nyalajs/tenancy';

@Module({
  providers: [
    JwtTenantResolver,
    SubdomainTenantResolver,
    {
      provide: 'TENANT_RESOLVERS',
      useFactory: (jwt: JwtTenantResolver, subdomain: SubdomainTenantResolver) => [jwt, subdomain],
      inject: [JwtTenantResolver, SubdomainTenantResolver],
    },
    { provide: 'TENANT_REQUIRED', useValue: false },
    TenantMiddleware,
  ],
})
export class AppModule {}
```

Then register it as global middleware in `config/middleware.ts` — see [Multi-Tenancy Setup](../multi-tenancy/setup) for the complete wiring, including where the middleware actually gets attached to the request pipeline.

There is no `TenantGuard` and no `@CurrentTenant()` decorator — tenant enforcement happens at the repository/`Model` layer (fail-closed on `TenantContext.get()` being empty), not via a separate guard on the controller.

## `TenantResolver`

The interface every resolver in `TENANT_RESOLVERS` implements:

```typescript
export interface TenantResolver {
  resolve(request: any): Promise<string | undefined>;
}
```

`resolve()` returns `undefined` (not a rejected promise) when it can't determine a tenant from this request — `TenantMiddleware` tries each resolver in `TENANT_RESOLVERS` order until one returns a value. A custom resolver looks like:

```typescript
import { Injectable } from '@nyalajs/core';
import { TenantResolver } from '@nyalajs/tenancy';

@Injectable()
export class HeaderTenantResolver implements TenantResolver {
  async resolve(request: any): Promise<string | undefined> {
    return request.headers['x-tenant-id'];
  }
}
```

The framework ships `JwtTenantResolver`, `SubdomainTenantResolver`, and `HeaderTenantResolver` already — write a custom one only for a resolution strategy those don't cover.

## Shared (Non-Tenant-Scoped) Data

`Model`'s tenant enforcement is determined by the model itself, not by a flag on `TenantRepository`: `Model` checks whether the underlying table declares a `tenantId` column (`packages/database/src/model.ts`) — if it doesn't, that model's queries are never tenant-filtered, active `TenantContext` or not. So a genuinely cross-tenant resource (subscription plans, the `Tenant` model itself) is just a `Model` with no `tenantId` column:

```typescript
import { Table, Primary, Column, StringColumn } from '@nyalajs/database';
import { Model } from '@nyalajs/database';

@Table('plans')
class Plan extends Model {
  @Primary() @StringColumn() id!: string;
  @Column() name!: string;
  // no tenantId column — this model is never tenant-scoped
}
```

`TenantRepository<Plan>` (or `TenantRepository<Tenant>`, for managing tenants themselves) works the same way as any other `TenantRepository` subclass — there's no separate constructor flag to opt out, because the model's own shape already determines whether `Model` enforces scoping.

## `TenantRecord` / `TenantRegistry`

`TenantRecord` is a real `Model` (table `nyala_tenants`, lives in your shared/system database, never itself tenant-scoped) tracking each tenant's `isolationMode` (`"shared" | "dedicated"`), `connectionString`/`driver` (dedicated only), and `migrationStatus`. `TenantRegistry` is the CRUD/lookup service over it, with a short-TTL in-process cache (invalidated immediately on every write):

```typescript
import { TenantRegistry } from '@nyalajs/tenancy';

const registry = new TenantRegistry(30_000); // cache TTL in ms, default 30s

await registry.register({ id: 'acme', name: 'Acme Corp' }); // isolationMode defaults to "shared"
const record = await registry.find('acme');        // null if unregistered
const record2 = await registry.findOrThrow('acme'); // throws a clear error if unregistered

await registry.setIsolation('acme', {
  isolationMode: 'dedicated',
  connectionString: process.env.ACME_DATABASE_URL!,
  driver: 'pg',
});
await registry.setMigrationStatus('acme', 'copying_data');
```

## `TenantConnectionManager`

Owns the live, pooled connections for dedicated tenants — lazily opens one on first use (via `@nyalajs/database`'s `openConnection()`), reuses it on every later call, deduplicates concurrent cold-open races for the same tenant, evicts by LRU under a connection cap, and sweeps idle connections on a timer:

```typescript
import { TenantConnectionManager } from '@nyalajs/tenancy';

const connections = new TenantConnectionManager({
  idleTtlMs: 10 * 60 * 1000,  // default
  maxOpenConnections: 100,     // default
  maxConnectionsPerTenant: 5,  // default
});

const record = await registry.findOrThrow('acme'); // must have isolationMode: "dedicated"
const db = await connections.getConnection(record); // opens once, pooled/reused after

connections.startIdleSweep(); // starts the periodic idle-close timer — no-op until called
connections.size();           // how many dedicated connections are currently open
await connections.evict('acme'); // close and forget one tenant's connection
await connections.closeAll();    // shutdown — closes everything
```

`getConnection()` throws if the record's `isolationMode` isn't `"dedicated"` or it has no `connectionString` — a defensive backstop, not the primary check (that's `TenantMiddleware` consulting `TenantRegistry` first).

## `TenantMigrationService`

Moves one tenant's data between shared and dedicated storage live — see [Setup](../multi-tenancy/setup#migrating-a-tenant-live) for the full walkthrough of what each step does and how to track progress:

```typescript
import { TenantMigrationService } from '@nyalajs/tenancy';

const migrations = new TenantMigrationService(registry, connections); // connections is optional

await migrations.migrateToDedicated({
  tenantId: 'acme',
  connectionString: process.env.ACME_DATABASE_URL!,
  driver: 'pg',            // default "pg"
  models: [User, Order],   // every tenant-scoped Model to move — required, no auto-discovery
  batchSize: 500,           // default
  autoCreateSchema: true,   // default — auto-creates the target's tables from the Model definitions
  onProgress: (table, rowsCopiedSoFar) => {},
});
// -> { tenantId, tablesCopied: string[], rowsCopied: number }

await migrations.migrateToShared({
  tenantId: 'acme',
  models: [User, Order],
  closeSourceConnection: true, // default — evicts the pooled dedicated connection after cutover
});
```

Both throw before touching anything if the tenant is already in the target mode, or if row-count verification fails after copying (in which case the cutover never happens and `migrationStatus` is set to `"failed"`).

## Cross-Tenant Enforcement

There's no built-in "switch tenant" API and no `OnTenantCreate()`/`OnTenantDelete()` event decorators. The isolation guarantee is intentionally narrow: any `Model` that declares a `tenantId` column is always scoped to `TenantContext.get()`, and fails closed (throws) rather than returning unscoped data when no tenant is active — see [Data Isolation](../multi-tenancy/isolation) for the exact mechanism. There's no supported way to bypass this on a tenant-scoped model from inside a request; genuine cross-tenant work (an admin panel, a background job iterating every tenant) should run each tenant's portion inside its own `TenantContext.run()` scope instead of trying to disable scoping.

## Next Steps

- [Multi-Tenancy Overview](../multi-tenancy/overview) - Concepts
- [Setup](../multi-tenancy/setup) - Implementation
- [Data Isolation](../multi-tenancy/isolation) - How the fail-closed guarantee works
- [Best Practices](../multi-tenancy/best-practices) - Guidelines
