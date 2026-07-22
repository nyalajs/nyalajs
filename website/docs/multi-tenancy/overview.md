# Multi-Tenancy Overview

Nyala provides built-in multi-tenancy support for building SaaS applications with automatic data isolation.

## What is Multi-Tenancy?

Multi-tenancy allows a single application instance to serve multiple customers (tenants), with each tenant's data completely isolated from others.

### Use Cases

- **SaaS Applications**: Serve multiple customers from one codebase
- **B2B Platforms**: Separate data for each business customer
- **Agency Platforms**: Manage multiple client accounts
- **Educational Platforms**: Isolate schools or institutions

## Key Features

### Automatic Data Isolation

No manual tenant filtering required:

```typescript
// Repository automatically scopes to current tenant
const users = await this.userRepo.findAll();
// Only returns current tenant's users
```

### Tenant Context

Automatic tenant resolution from requests:

```typescript
// Tenant extracted from header, subdomain, or JWT
@Get('/users')
async getUsers() {
  // Current tenant automatically set
  return this.usersService.findAll();
}
```

### Cross-Tenant Protection

Built-in guards prevent cross-tenant access:

```typescript
// Cannot access other tenant's data even with direct ID
const user = await this.userRepo.findById('other-tenant-user-id');
// Returns null - automatic protection
```

## Architecture

```
Request with Tenant ID
    ↓
Tenant Middleware (extracts tenant)
    ↓
Tenant Context (stores current tenant)
    ↓
Tenant Repository (auto-filters by tenant)
    ↓
Database (isolated data)
```

## Quick Start

### 1. Use SaaS Template

```bash
nyala new my-saas --template=saas
```

### 2. Define Tenant Model

```typescript
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  domain: varchar('domain', { length: 255 }).unique(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 3. Add Tenant ID to Models

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('users_tenant_idx').on(table.tenantId),
  uniqueEmailPerTenant: unique('unique_email_tenant')
    .on(table.tenantId, table.email),
}));
```

### 4. Use Tenant-Aware Repository

```typescript
@Injectable()
export class UsersRepository extends TenantRepository<User> {
  constructor(tenantContext: TenantContext) {
    super(users, tenantContext);
  }

  // All queries automatically filtered by tenant
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
    // Automatically adds: AND tenant_id = current_tenant
  }
}
```

### 5. Set Tenant Context

```typescript
@Injectable()
export class TenantMiddleware implements Middleware {
  constructor(private tenantContext: TenantContext) {}

  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      throw new BadRequestException('Tenant ID required');
    }

    this.tenantContext.setTenantId(tenantId);
    next();
  }
}
```

## Tenant Resolution Strategies

### 1. Header-Based

```typescript
// Client sends: X-Tenant-ID: tenant-uuid
const tenantId = req.headers['x-tenant-id'];
```

### 2. Subdomain-Based

```typescript
// tenant1.myapp.com → tenant1
const subdomain = req.hostname.split('.')[0];
const tenant = await tenantRepo.findBySlug(subdomain);
```

### 3. Domain-Based

```typescript
// customer-domain.com → mapped to tenant
const tenant = await tenantRepo.findByDomain(req.hostname);
```

### 4. JWT-Based

```typescript
// Tenant ID in JWT payload
const payload = jwtService.verify(token);
const tenantId = payload.tenantId;
```

## Data Isolation Patterns

### Database Per Tenant

Separate database for each tenant:

```typescript
class TenantDatabaseService {
  getConnection(tenantId: string) {
    return createConnection({
      database: `tenant_${tenantId}`,
      // ... other config
    });
  }
}
```

**Pros**: Complete isolation, easy backup
**Cons**: Higher cost, complex migrations

### Schema Per Tenant

Separate schema in same database:

```typescript
class TenantSchemaService {
  setSchema(tenantId: string) {
    return db.execute(sql`SET search_path TO tenant_${tenantId}`);
  }
}
```

**Pros**: Good isolation, manageable cost
**Cons**: More complex setup

### Row-Level (Recommended)

Tenant ID column in each table:

```typescript
// Add tenantId to every table
tenantId: uuid('tenant_id').notNull().references(() => tenants.id)

// Filter all queries by tenant
WHERE tenant_id = current_tenant_id
```

**Pros**: Simple, cost-effective, easy to scale
**Cons**: Requires careful query filtering

## Benefits

### For Developers

- **Automatic Filtering**: No manual tenant checks
- **Type Safety**: TypeScript throughout
- **Less Code**: Framework handles complexity
- **Easy Testing**: Clear tenant boundaries

### For Businesses

- **Cost Effective**: Shared infrastructure
- **Easy Scaling**: Add tenants without code changes
- **Data Security**: Complete isolation
- **Flexible Pricing**: Per-tenant billing ready

## Common Patterns

### Tenant Creation

```typescript
@Injectable()
export class TenantsService {
  async create(dto: CreateTenantDto) {
    // Create tenant
    const tenant = await this.tenantRepo.create({
      name: dto.name,
      slug: this.generateSlug(dto.name),
      domain: dto.domain,
    });

    // Create admin user for tenant
    await this.usersService.create({
      tenantId: tenant.id,
      email: dto.adminEmail,
      name: dto.adminName,
      role: 'admin',
    });

    return tenant;
  }
}
```

### Tenant Switching (Admin Feature)

```typescript
@Injectable()
export class AdminTenantService {
  async switchTenant(adminUserId: string, tenantId: string) {
    // Verify admin can access tenant
    const admin = await this.adminsRepo.findById(adminUserId);
    if (!admin.isSuperAdmin) {
      throw new ForbiddenException('Not authorized');
    }

    // Generate tenant-specific token
    return this.jwtService.sign({
      sub: adminUserId,
      tenantId,
      role: 'admin',
    });
  }
}
```

### Shared Resources

```typescript
// Some tables might be shared across tenants
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  price: decimal('price', { precision: 10, scale: 2 }),
  // No tenantId - shared across all tenants
});

// Regular repository without tenant filtering
@Injectable()
export class PlansRepository extends BaseRepository<Plan> {
  constructor() {
    super(plans);
  }
}
```

## Security Considerations

### 1. Always Validate Tenant Access

```typescript
async update(id: string, dto: UpdateDto) {
  const resource = await this.repo.findById(id);

  // Verify belongs to current tenant
  if (resource.tenantId !== this.tenantContext.getCurrentTenantId()) {
    throw new NotFoundException(); // Don't reveal it exists
  }

  return this.repo.update(id, dto);
}
```

### 2. Index Tenant Columns

```typescript
// Add index for performance
(table) => ({
  tenantIdx: index('users_tenant_idx').on(table.tenantId),
})
```

### 3. Use Foreign Key Constraints

```typescript
tenantId: uuid('tenant_id')
  .notNull()
  .references(() => tenants.id, { onDelete: 'cascade' })
```

### 4. Audit Tenant Access

```typescript
@Injectable()
export class TenantAuditMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = this.tenantContext.getCurrentTenantId();

    console.log({
      tenantId,
      userId: req.user?.id,
      path: req.path,
      method: req.method,
      timestamp: new Date(),
    });

    next();
  }
}
```

## Next Steps

- [Setup](./setup) - Implementation guide
- [Tenant Resolution](./resolution) - Resolution strategies
- [Data Isolation](./isolation) - Isolation patterns
- [Best Practices](./best-practices) - Security and performance
