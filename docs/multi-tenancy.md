# Multi-Tenancy Guide

Nyala provides native multi-tenancy support with automatic tenant isolation.

## Tenant Resolution

### Subdomain Resolution

```typescript
import { SubdomainTenantResolver } from "@nyalajs/tenancy";

// tenant1.myapp.com -> tenant1
// tenant2.myapp.com -> tenant2
```

### Header Resolution

```typescript
import { HeaderTenantResolver } from "@nyalajs/tenancy";

// X-Tenant-ID: tenant1
```

### JWT Resolution

```typescript
import { JwtTenantResolver } from "@nyalajs/tenancy";

// Extracts tenantId from JWT payload
```

## Tenant-Safe Repositories

```typescript
import { TenantRepository } from "@nyalajs/tenancy";
import { Injectable } from "@nyalajs/core";

@Injectable()
export class UserRepository extends TenantRepository<User> {
  async find(criteria: any): Promise<User[]> {
    const tenantId = this.getTenantId(); // Automatically enforced
    return await this.db.users.find({ ...criteria, tenantId });
  }

  async create(data: Partial<User>): Promise<User> {
    const tenantId = this.getTenantId();
    return await this.db.users.create({ ...data, tenantId });
  }
}
```

## Configuration

```typescript
import { Module } from "@nyalajs/core";
import { TenantMiddleware, SubdomainTenantResolver } from "@nyalajs/tenancy";

@Module({
  providers: [
    {
      provide: "TENANT_RESOLVERS",
      useValue: [new SubdomainTenantResolver()],
    },
    {
      provide: "TENANT_REQUIRED",
      useValue: true,
    },
    TenantMiddleware,
  ],
})
export class AppModule {}
```

## Best Practices

1. **Always use TenantRepository** for data access
2. **Never bypass tenant filtering** without explicit admin checks
3. **Audit all tenant context bypasses**
4. **Test tenant isolation** thoroughly
5. **Monitor cross-tenant access attempts**
