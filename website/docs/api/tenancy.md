# Tenancy API

Multi-tenancy API reference.

## Tenant Context

Access current tenant information.

```typescript
import { TenantContext } from '@nyalajs/tenancy';

@Injectable()
export class UsersService {
  constructor(private tenantContext: TenantContext) {}

  getCurrentTenant() {
    return this.tenantContext.getCurrentTenantId();
  }

  getTenantData() {
    return this.tenantContext.getTenant();
  }
}
```

## Tenant Repository

Base repository with automatic tenant filtering.

```typescript
import { TenantRepository } from '@nyalajs/tenancy';

@Injectable()
export class UsersRepository extends TenantRepository<User> {
  constructor(tenantContext: TenantContext) {
    super(users, tenantContext);
  }

  // All queries automatically filtered by tenant
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }
}
```

## Tenant Middleware

Extract tenant from requests.

```typescript
import { TenantMiddleware } from '@nyalajs/tenancy';

@Module({})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
```

## Tenant Guard

Protect routes requiring tenant context.

```typescript
import { TenantGuard } from '@nyalajs/tenancy';

@Controller('/api')
@UseGuards(TenantGuard)
export class ApiController {
  // Requires valid tenant
}
```

## Tenant Decorator

Get current tenant in controllers.

```typescript
import { CurrentTenant } from '@nyalajs/tenancy';

@Get('/settings')
async getSettings(@CurrentTenant() tenant: Tenant) {
  return tenant;
}
```

## Tenant Resolution

Configure how tenants are resolved.

```typescript
import { TenantResolver } from '@nyalajs/tenancy';

@Injectable()
export class CustomTenantResolver implements TenantResolver {
  async resolve(request: Request): Promise<string> {
    // Header-based
    const tenantId = request.headers['x-tenant-id'];
    if (tenantId) return tenantId;

    // Subdomain-based
    const subdomain = request.hostname.split('.')[0];
    const tenant = await this.findBySlug(subdomain);
    if (tenant) return tenant.id;

    // JWT-based
    const token = extractToken(request);
    const payload = verifyToken(token);
    return payload.tenantId;
  }
}
```

## Shared Resources

Resources accessible across all tenants.

```typescript
import { BaseRepository } from '@nyalajs/core';

@Injectable()
export class PlansRepository extends BaseRepository<Plan> {
  constructor() {
    super(plans);
    // No tenant context - shared across tenants
  }
}
```

## Tenant Switching

Switch tenant context (admin feature).

```typescript
@Injectable()
export class AdminService {
  constructor(private tenantContext: TenantContext) {}

  async switchTenant(tenantId: string) {
    this.tenantContext.setTenantId(tenantId);
  }
}
```

## Cross-Tenant Queries

Bypass tenant filtering (use carefully).

```typescript
@Injectable()
export class AdminRepository extends TenantRepository<User> {
  async findAcrossAllTenants(email: string) {
    // Bypass tenant filter
    return db
      .select()
      .from(users)
      .where(eq(users.email, email));
  }
}
```

## Tenant Isolation

Ensure data isolation.

```typescript
// Add tenant check in services
@Injectable()
export class OrdersService {
  async findById(id: string) {
    const order = await this.repo.findById(id);

    if (!order) {
      throw new NotFoundException();
    }

    // Verify tenant ownership
    const currentTenant = this.tenantContext.getCurrentTenantId();
    if (order.tenantId !== currentTenant) {
      throw new NotFoundException(); // Don't reveal it exists
    }

    return order;
  }
}
```

## Tenant Events

Listen to tenant-related events.

```typescript
import { OnTenantCreate, OnTenantDelete } from '@nyalajs/tenancy';

@Injectable()
export class TenantListener {
  @OnTenantCreate()
  async handleTenantCreated(tenant: Tenant) {
    // Initialize tenant resources
    await this.createDefaultData(tenant.id);
  }

  @OnTenantDelete()
  async handleTenantDeleted(tenantId: string) {
    // Cleanup tenant resources
    await this.cleanupData(tenantId);
  }
}
```

## Next Steps

- [Multi-Tenancy Overview](../multi-tenancy/overview) - Concepts
- [Setup](../multi-tenancy/setup) - Implementation
- [Best Practices](../multi-tenancy/best-practices) - Guidelines
