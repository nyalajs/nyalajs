# Multi-Tenancy Guide

## Overview

This SaaS starter implements **true multi-tenancy** with complete data isolation at the database level. Each tenant's data is automatically filtered and protected from cross-tenant access.

## Architecture

### Tenant Isolation Strategy

We use **shared database with tenant_id column** approach:

```
┌──────────────────────────────────────────────────┐
│                  Database                         │
│  ┌────────────────────────────────────────────┐  │
│  │ Users Table                                 │  │
│  ├────┬────────┬───────┬──────────┬────────── │  │
│  │ id │ tenant │ name  │  email   │queries
✅ **Type Safe** - TypeScript ensures correct usage
✅ **Easy Backup** - Single database to backup
✅ **Shared Resources** - Efficient resource utilization

## Tenant Resolution

The system supports **three methods** for identifying the current tenant:

### 1. Subdomain Resolution (Recommended)

```
https://acme.yoursaas.com → tenant: acme
https://corp.yoursaas.com → tenant: corp
```

**Configuration:**
```typescript
// config/tenancy.ts
export default {
    resolution: "subdomain",
    baseDomain: "yoursaas.com",
};
```

### 2. Header-Based Resolution

```
GET /api/users
X-Tenant-ID: acme
```

**Configuration:**
```typescript
// config/tenancy.ts
export default {
    resolution: "header",
    headerName: "X-Tenant-ID",
};
```

### 3. JWT Token Resolution

Tenant ID embedded in JWT token:

```json
{
    "sub": "user-id",
    "tenantId": "acme",
    "email": "john@acme.com"
}
```

**Configuration:**
```typescript
// config/tenancy.ts
export default {
    resolution: "jwt",
    jwtKey: "tenantId",
};
```

## Request Flow

```
1. HTTP Request arrives
   ↓
2. Tenant Middleware extracts tenant (subdomain/header/JWT)
   ↓
3. Tenant context stored in RequestContext
   ↓
4. Controller receives request
   ↓
5. Service called
   ↓
6. Repository queries database
   ↓
7. BaseRepository automatically adds WHERE tenant_id = ?
   ↓
8. Only tenant's data returned
```

## Using Tenant-Aware Repositories

### Automatic Tenant Filtering

All repositories extending `BaseRepository` with `isTenantAware: true` automatically filter by tenant:

```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users, true); // true = tenant-aware
    }

    // All queries automatically filtered by tenant
    async findByEmail(email: string): Promise<User | null> {
        // Only searches within current tenant
        return this.findOne(eq(users.email, email));
    }
}
```

### Creating Records

Tenant ID is automatically added:

```typescript
const user = await userRepository.create({
    name: "John Doe",
    email: "john@example.com",
    // tenantId is automatically added from context
});
```

### Querying Records

All queries scoped to current tenant:

```typescript
// Only returns users from current tenant
const users = await userRepository.findAll();

// Only searches within current tenant
const user = await userRepository.findById("user-id");

// Custom queries also tenant-scoped
const activeUsers = await userRepository.findAll({
    where: eq(users.isActive, true)
});
```

### Cross-Tenant Prevention

The system **prevents** cross-tenant data access:

```typescript
// User trying to access another tenant's data
const userId = "user-from-different-tenant";
const user = await userRepository.findById(userId);
// Returns null (not found) because it's filtered by current tenant
```

## Managing Tenants

### Tenant Repository (Non-Tenant-Aware)

The `TenantRepository` manages tenants themselves, so it's **not** tenant-filtered:

```typescript
@Injectable()
export class TenantRepository extends BaseRepository<Tenant> {
    constructor() {
        super(tenants, false); // false = NOT tenant-aware
    }

    async findBySlug(slug: string): Promise<Tenant | null> {
        return this.findOne(eq(tenants.slug, slug));
    }
}
```

### Creating a New Tenant

```typescript
const tenant = await tenantRepository.create({
    name: "Acme Corp",
    slug: "acme",
    domain: "acme.com",
    plan: "pro",
});
```

### Tenant Lifecycle

1. **Registration**: Create tenant and first admin user
2. **Activation**: Set `isActive = true`
3. **Usage**: All user data automatically scoped
4. **Suspension**: Set `isActive = false`
5. **Deletion**: Cascade delete all tenant data

## Request Context

Access tenant information in your code:

```typescript
import { RequestContext } from "@nyala/core";

// Get current tenant
const context = RequestContext.get();
const tenant = context.tenant; // { id, name, slug, ... }

// Get current user
const user = context.user;
```

## Middleware Setup

The tenant middleware must run **before** any business logic:

```typescript
// bootstrap/app.module.ts
@Module({
    providers: [
        // Middleware
        {
            provide: "APP_MIDDLEWARE",
            useClass: TenantMiddleware,
        },
        {
            provide: "APP_MIDDLEWARE",
            useClass: AuthMiddleware, // After tenant
        },
    ],
})
```

## Database Schema

### Tenants Table

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    plan VARCHAR(50) DEFAULT 'free',
    settings TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Users Table (Tenant-Scoped)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Unique within tenant
    UNIQUE(tenant_id, email)
);

-- Index for fast tenant queries
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
```

## Security Best Practices

### 1. Always Use Repositories

❌ **Don't** query directly:
```typescript
// DANGEROUS - No tenant filtering!
const users = await db.select().from(users);
```

✅ **Do** use repositories:
```typescript
// SAFE - Automatically tenant-filtered
const users = await userRepository.findAll();
```

### 2. Validate Tenant Context

```typescript
const context = RequestContext.get();
if (!context?.tenant) {
    throw new Error("No tenant context");
}
```

### 3. Unique Constraints

Make constraints tenant-scoped:

```sql
-- Wrong: Email unique globally
UNIQUE(email)

-- Correct: Email unique per tenant
UNIQUE(tenant_id, email)
```

### 4. Foreign Keys

Always include tenant_id in related tables:

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL,
    -- Ensure user belongs to same tenant
    FOREIGN KEY (tenant_id, user_id)
        REFERENCES users(tenant_id, id)
);
```

## Testing Multi-Tenancy

### Unit Tests

Mock the request context:

```typescript
import { RequestContext } from "@nyala/core";

describe("UserRepository", () => {
    beforeEach(() => {
        // Mock tenant context
        jest.spyOn(RequestContext, "get").mockReturnValue({
            tenant: { id: "tenant-1", slug: "acme" },
        });
    });

    it("should filter by tenant", async () => {
        const users = await userRepository.findAll();
        // Verify tenant filtering
    });
});
```

### Integration Tests

Test with real tenant switching:

```typescript
describe("Multi-tenant isolation", () => {
    it("should isolate tenant data", async () => {
        // Create tenant 1 data
        await setTenant("tenant-1");
        const user1 = await createUser({ name: "User 1" });

        // Create tenant 2 data
        await setTenant("tenant-2");
        const user2 = await createUser({ name: "User 2" });

        // Switch back to tenant 1
        await setTenant("tenant-1");
        const users = await userRepository.findAll();

        // Should only see tenant 1 data
        expect(users).toHaveLength(1);
        expect(users[0].id).toBe(user1.id);
    });
});
```

## Common Patterns

### Admin Access Across Tenants

For superadmin who needs to see all tenants:

```typescript
@Injectable()
export class AdminService {
    async getAllTenantsUsers(): Promise<User[]> {
        // Use raw query bypassing repository
        return db.select().from(users);
    }
}
```

### Tenant Switching

Allow users with multiple tenant access:

```typescript
async switchTenant(userId: string, tenantId: string) {
    // Verify user has access to tenant
    const access = await checkUserTenantAccess(userId, tenantId);
    if (!access) throw new Error("Access denied");

    // Generate new JWT with new tenant
    return generateJWT({ userId, tenantId });
}
```

### Shared Resources

For resources shared across tenants (like templates):

```typescript
@Injectable()
export class TemplateRepository extends BaseRepository<Template> {
    constructor() {
        super(templates, false); // NOT tenant-aware
    }

    async findGlobalTemplates(): Promise<Template[]> {
        return this.findAll({
            where: eq(templates.isGlobal, true),
        });
    }
}
```

## Monitoring & Metrics

Track tenant-specific metrics:

```typescript
// Track requests per tenant
metrics.increment("requests", { tenant: tenant.slug });

// Track storage per tenant
metrics.gauge("storage_used", storageBytes, { tenant: tenant.slug });

// Alert on tenant-specific issues
if (errorRate > threshold) {
    alert(`High error rate for tenant ${tenant.slug}`);
}
```

## Migration Strategy

### Adding Tenant ID to Existing Tables

```sql
-- 1. Add tenant_id column (nullable first)
ALTER TABLE existing_table ADD COLUMN tenant_id UUID;

-- 2. Backfill tenant_id (custom logic)
UPDATE existing_table SET tenant_id = 'default-tenant-id';

-- 3. Make it NOT NULL
ALTER TABLE existing_table ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Add foreign key
ALTER TABLE existing_table
    ADD CONSTRAINT fk_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- 5. Add index
CREATE INDEX idx_existing_tenant ON existing_table(tenant_id);
```

## Troubleshooting

### "Tenant context not found"

**Cause**: Middleware not running or context not set.

**Solution**:
1. Check middleware is registered
2. Verify tenant resolution is working
3. Check request has tenant identifier (subdomain/header/JWT)

### Cross-tenant data leak

**Cause**: Using raw queries instead of repositories.

**Solution**: Always use repositories for tenant-scoped data.

### Performance issues

**Cause**: Missing indexes on tenant_id columns.

**Solution**: Add indexes on all tenant_id foreign keys:
```sql
CREATE INDEX idx_table_tenant ON table_name(tenant_id);
```

## Summary

✅ **Always use repositories** for tenant-scoped data
✅ **Validate tenant context** before operations
✅ **Make unique constraints** tenant-scoped
✅ **Test tenant isolation** thoroughly
✅ **Monitor per-tenant** metrics
✅ **Index tenant_id** columns
✅ **Use proper foreign keys** with tenant_id

Multi-tenancy is transparent to your application code - just use repositories and the framework handles the rest!
