# Repositories

Repositories handle data access and database operations. They provide a clean abstraction over the database layer.

::: tip Repository vs. Model
This is one of two data-access styles Nyala supports, not the only one. `@nyalajs/database`'s [`Model`](./models) is an Active-Record base class you import directly from the package (`@HasMany()`/`@BelongsTo()`, a fluent query builder, automatic tenant scoping) — reach for it first for a straightforward CRUD model.

`BaseRepository`, documented on this page, is a **scaffolded pattern**, not a package export — `nyala new` generates `app/repositories/base.repository.ts` into your project (tailored to your chosen database dialect and multi-tenancy setup), and you extend it per entity. There's no `import { BaseRepository } from '@nyalajs/database'`; the class lives in your own codebase, which is exactly the point — it's yours to modify, not a black box from the framework. Reach for this style when you want the Repository pattern's separation between data access and domain logic, or when a query is complex enough that hand-writing it against Drizzle directly (as shown throughout this page) is clearer than expressing it through `Model`.

Every official starter template (`basic-starter`, `inertia-starter`, `cms-starter`, `saas-starter`) ships a working `BaseRepository` in `app/repositories/` — the examples below match the shape of the real, generated file, not a hypothetical API.
:::

## Basic Repository

Extend the generated `BaseRepository` class:

```typescript
import { Injectable } from '@nyalajs/core';
import { BaseRepository } from './base.repository'; // scaffolded into your project by `nyala new`
import { users, User } from '../../database/schema/users.schema';

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor() {
    super(users);
  }
}
```

## Base Repository Methods

The `BaseRepository` provides common operations:

```typescript
// Find all records
const users = await userRepo.findAll();

// Find with options
const users = await userRepo.findAll({
  limit: 10,
  offset: 0,
  where: eq(users.active, true),
});

// Find by ID
const user = await userRepo.findById('user-id');

// Find one matching condition
const user = await userRepo.findOne(eq(users.email, 'user@example.com'));

// Create
const user = await userRepo.create({
  email: 'new@example.com',
  name: 'John Doe',
});

// Update
const user = await userRepo.update('user-id', {
  name: 'Jane Doe',
});

// Delete
const deleted = await userRepo.delete('user-id');

// Count
const total = await userRepo.count();
const active = await userRepo.count(eq(users.active, true));

// Check existence
const exists = await userRepo.exists(eq(users.email, 'test@example.com'));
```

## Custom Methods

Add domain-specific methods:

```typescript
@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor() {
    super(users);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne(eq(users.email, email));
  }

  async findActive(): Promise<User[]> {
    return this.findAll({
      where: eq(users.active, true),
    });
  }

  async findByRole(role: string): Promise<User[]> {
    return this.findAll({
      where: eq(users.role, role),
    });
  }

  async activate(id: string): Promise<User | null> {
    return this.update(id, { active: true });
  }

  async deactivate(id: string): Promise<User | null> {
    return this.update(id, { active: false });
  }
}
```

## Complex Queries

Build complex database queries:

```typescript
import { and, or, eq, gt, lt, like, inArray } from 'drizzle-orm';

@Injectable()
export class ProductsRepository extends BaseRepository<Product> {
  constructor() {
    super(products);
  }

  async search(query: string): Promise<Product[]> {
    return this.findAll({
      where: or(
        like(products.name, `%${query}%`),
        like(products.description, `%${query}%`)
      ),
    });
  }

  async findInPriceRange(min: number, max: number): Promise<Product[]> {
    return this.findAll({
      where: and(
        gt(products.price, min),
        lt(products.price, max)
      ),
    });
  }

  async findByCategories(categoryIds: string[]): Promise<Product[]> {
    return this.findAll({
      where: inArray(products.categoryId, categoryIds),
    });
  }

  async findAvailable(): Promise<Product[]> {
    return this.findAll({
      where: and(
        eq(products.active, true),
        gt(products.stock, 0)
      ),
    });
  }
}
```

## Relationships

Handle related data:

```typescript
import { db } from '../../database/connection';

@Injectable()
export class OrdersRepository extends BaseRepository<Order> {
  constructor() {
    super(orders);
  }

  async findWithItems(id: string) {
    const order = await db
      .select()
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orders.id, id));

    return this.transformOrderWithItems(order);
  }

  async findByUserWithItems(userId: string) {
    return db
      .select()
      .from(orders)
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(eq(orders.userId, userId));
  }

  private transformOrderWithItems(rows: any[]) {
    // Transform joined rows into nested structure
    const order = rows[0];
    return {
      ...order.orders,
      items: rows.map(row => ({
        ...row.order_items,
        product: row.products,
      })),
    };
  }
}
```

## Pagination

Implement pagination:

```typescript
interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ProductsRepository extends BaseRepository<Product> {
  constructor() {
    super(products);
  }

  async paginate(
    options: PaginationOptions
  ): Promise<PaginatedResult<Product>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const offset = (page - 1) * limit;

    // Get total count
    const total = await this.count();

    // Get paginated data
    const data = await db
      .select()
      .from(products)
      .limit(limit)
      .offset(offset)
      .orderBy(
        sortOrder === 'desc'
          ? desc(products[sortBy])
          : asc(products[sortBy])
      );

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
```

## Transactions

Handle database transactions:

```typescript
@Injectable()
export class AccountsRepository extends BaseRepository<Account> {
  constructor() {
    super(accounts);
  }

  async transfer(fromId: string, toId: string, amount: number) {
    return await db.transaction(async (trx) => {
      // Deduct from sender
      const sender = await trx
        .select()
        .from(accounts)
        .where(eq(accounts.id, fromId))
        .for('update');  // Lock row

      if (sender[0].balance < amount) {
        throw new Error('Insufficient funds');
      }

      await trx
        .update(accounts)
        .set({ balance: sender[0].balance - amount })
        .where(eq(accounts.id, fromId));

      // Add to receiver
      const receiver = await trx
        .select()
        .from(accounts)
        .where(eq(accounts.id, toId))
        .for('update');

      await trx
        .update(accounts)
        .set({ balance: receiver[0].balance + amount })
        .where(eq(accounts.id, toId));

      return { success: true };
    });
  }
}
```

## Aggregations

Perform aggregate operations:

```typescript
import { sum, count, avg, min, max } from 'drizzle-orm';

@Injectable()
export class OrdersRepository extends BaseRepository<Order> {
  constructor() {
    super(orders);
  }

  async getStatsByUser(userId: string) {
    const result = await db
      .select({
        totalOrders: count(),
        totalSpent: sum(orders.total),
        averageOrder: avg(orders.total),
        minOrder: min(orders.total),
        maxOrder: max(orders.total),
      })
      .from(orders)
      .where(eq(orders.userId, userId));

    return result[0];
  }

  async getMonthlyRevenue(year: number, month: number) {
    const result = await db
      .select({
        revenue: sum(orders.total),
        orderCount: count(),
      })
      .from(orders)
      .where(
        and(
          eq(sql`EXTRACT(YEAR FROM ${orders.createdAt})`, year),
          eq(sql`EXTRACT(MONTH FROM ${orders.createdAt})`, month)
        )
      );

    return result[0];
  }
}
```

## Raw Queries

Execute raw SQL when needed:

```typescript
import { sql } from 'drizzle-orm';

@Injectable()
export class AnalyticsRepository {
  async getComplexStats() {
    return await db.execute(sql`
      SELECT
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as orders,
        SUM(total) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `);
  }

  async searchFullText(query: string) {
    return await db.execute(sql`
      SELECT * FROM products
      WHERE to_tsvector('english', name || ' ' || description)
        @@ to_tsquery('english', ${query})
    `);
  }
}
```

## Soft Deletes

Implement soft delete functionality:

```typescript
@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor() {
    super(users);
  }

  async findAll(options?: any): Promise<User[]> {
    // Override to exclude soft deleted
    return super.findAll({
      ...options,
      where: and(
        options?.where,
        eq(users.deletedAt, null)
      ),
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));

    return result.rowCount > 0;
  }

  async restore(id: string): Promise<User | null> {
    return this.update(id, { deletedAt: null });
  }

  async findDeleted(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(isNotNull(users.deletedAt));
  }

  async forceDelete(id: string): Promise<boolean> {
    // Permanently delete
    return super.delete(id);
  }
}
```

## Multi-Tenancy

`saas-starter`'s generated `BaseRepository` builds tenant scoping in at the base, not as a separate wrapper class — every method (`findAll`/`findById`/`create`/`update`/`delete`/`count`) is tenant-scoped automatically:

```typescript
import { Injectable, TenantContext } from '@nyalajs/core';
import { eq, and, SQL } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../../database/connection';

@Injectable()
export abstract class BaseRepository<T> {
  constructor(
    protected readonly table: PgTable,
    protected readonly isTenantAware: boolean = true
  ) {}

  protected requireTenantFilter(): SQL | undefined {
    if (!this.isTenantAware) return undefined;

    // TenantContext.get() reads the request-scoped active tenant — not a
    // constructor-injected value, since this repository is a DI singleton;
    // storing the tenant on `this` would leak one request's tenant into
    // concurrent requests. Fails closed: throws if no tenant is active,
    // rather than silently returning every tenant's rows.
    const tenantId = TenantContext.get();
    if (!tenantId) {
      throw new Error('Tenant context required: no tenant is active for the current request.');
    }
    return eq((this.table as any).tenantId, tenantId);
  }

  async findAll(options?: { where?: SQL }): Promise<T[]> {
    const tenantFilter = this.requireTenantFilter();
    const where = tenantFilter
      ? (options?.where ? and(tenantFilter, options.where) : tenantFilter)
      : options?.where;

    let query = db.select().from(this.table);
    if (where) query = query.where(where) as any;
    return query as Promise<T[]>;
  }

  async create(data: Partial<T>): Promise<T> {
    this.requireTenantFilter(); // throws if tenant-aware with no active tenant
    const tenantId = this.isTenantAware ? TenantContext.get() : undefined;

    const results = await db
      .insert(this.table)
      .values(this.isTenantAware ? { ...data, tenantId } : data as any)
      .returning();
    return results[0] as T;
  }

  // findById/findOne/update/delete/count/exists follow the same pattern —
  // see the real generated file in app/repositories/base.repository.ts
  // for the full implementation.
}
```

## Best Practices

### 1. Single Responsibility

Each repository handles one entity:

```typescript
// ✅ Good: Focused repository
@Injectable()
export class UsersRepository extends BaseRepository<User> {
  // User-related queries only
}

// ❌ Bad: Mixed responsibilities
@Injectable()
export class DataRepository {
  async getUsers() { /* ... */ }
  async getOrders() { /* ... */ }
  async getProducts() { /* ... */ }
}
```

### 2. Named Methods

Use descriptive method names:

```typescript
// ✅ Good: Clear intent
async findActiveUsers()
async findUsersByRole(role: string)
async deactivateExpiredAccounts()

// ❌ Bad: Generic names
async get()
async fetch(param: any)
async do(action: string)
```

### 3. Type Safety

Always use proper types:

```typescript
// ✅ Good: Type-safe
async findByEmail(email: string): Promise<User | null> {
  return this.findOne(eq(users.email, email));
}

// ❌ Bad: Untyped
async findByEmail(email: any): Promise<any> {
  return this.findOne(eq(users.email, email));
}
```

### 4. Error Handling

Let errors bubble up to services:

```typescript
// ✅ Good: Let service handle
async findById(id: string): Promise<User | null> {
  return this.findOne(eq(users.id, id));
}

// Service handles the null case
async getUser(id: string): Promise<User> {
  const user = await this.userRepo.findById(id);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}

// ❌ Bad: Repository throws business logic error
async findById(id: string): Promise<User> {
  const user = await this.findOne(eq(users.id, id));
  if (!user) {
    throw new NotFoundException('User not found');  // Business logic
  }
  return user;
}
```

### 5. Query Optimization

Use indexes and optimize queries:

```typescript
// ✅ Good: Efficient query with index
async findByEmail(email: string) {
  // Assumes index on email column
  return this.findOne(eq(users.email, email));
}

// ✅ Good: Select specific columns
async findUserNames() {
  return db
    .select({
      id: users.id,
      name: users.name,
    })
    .from(users);
}

// ❌ Bad: N+1 query problem
async findWithOrders(userId: string) {
  const user = await this.findById(userId);
  const orders = await this.ordersRepo.findByUser(userId);  // Separate query
  return { ...user, orders };
}

// ✅ Good: Single query with join
async findWithOrders(userId: string) {
  return db
    .select()
    .from(users)
    .leftJoin(orders, eq(users.id, orders.userId))
    .where(eq(users.id, userId));
}
```

## Next Steps

- [Models](./models) - The Model/Active-Record alternative to Repositories, with relations and a query builder
- [Services](./services) - Business logic
- [Multi-Tenancy](../multi-tenancy/overview) - Tenant isolation
