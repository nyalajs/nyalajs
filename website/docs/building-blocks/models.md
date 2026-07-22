# Models

Models define your database schema and structure using Drizzle ORM. They provide type-safe database definitions.

## Basic Model

Define a model using Drizzle ORM:

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

## Column Types

### Text Types

```typescript
import { pgTable, varchar, text, char } from 'drizzle-orm/pg-core';

export const content = pgTable('content', {
  // Fixed length
  code: char('code', { length: 10 }),

  // Variable length with limit
  title: varchar('title', { length: 255 }),

  // Unlimited text
  body: text('body'),

  // Text with enum
  status: varchar('status', { length: 20, enum: ['draft', 'published'] }),
});
```

### Numeric Types

```typescript
import { pgTable, integer, real, doublePrecision, decimal } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  // Integers
  quantity: integer('quantity'),

  // Floating point
  weight: real('weight'),
  rating: doublePrecision('rating'),

  // Precise decimal for money
  price: decimal('price', { precision: 10, scale: 2 }),
});
```

### Boolean Type

```typescript
import { pgTable, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  active: boolean('active').default(true),
  emailVerified: boolean('email_verified').default(false),
});
```

### Date/Time Types

```typescript
import { pgTable, timestamp, date, time } from 'drizzle-orm/pg-core';

export const events = pgTable('events', {
  // Timestamp with timezone
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),

  // Date only
  eventDate: date('event_date'),

  // Time only
  startTime: time('start_time'),
});
```

### JSON Types

```typescript
import { pgTable, json, jsonb } from 'drizzle-orm/pg-core';

export const settings = pgTable('settings', {
  // JSON (stored as text)
  config: json('config'),

  // JSONB (binary JSON, faster queries)
  metadata: jsonb('metadata'),
});
```

### UUID Type

```typescript
import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull(),
});
```

## Constraints

### Primary Key

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Or composite primary key
  userId: uuid('user_id'),
  roleId: uuid('role_id'),
}, (table) => ({
  pk: primaryKey(table.userId, table.roleId),
}));
```

### Foreign Keys

```typescript
export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'set  10, scale: 2 }),
  quantity: integer('quantity'),
}, (table) => ({
  priceCheck: check('price_positive', sql`${table.price} >= 0`),
  quantityCheck: check('quantity_positive', sql`${table.quantity} >= 0`),
}));
```

### Not Null

```typescript
export const users = pgTable('users', {
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  bio: text('bio'),  // Nullable by default
});
```

## Default Values

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom(),
  active: boolean('active').default(true),
  role: varchar('role', { length: 20 }).default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  credits: integer('credits').default(0),
});
```

## Indexes

```typescript
import { index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at'),
}, (table) => ({
  emailIdx: index('email_idx').on(table.email),
  nameIdx: index('name_idx').on(table.name),
  createdAtIdx: index('created_at_idx').on(table.createdAt),

  // Composite index
  emailNameIdx: index('email_name_idx').on(table.email, table.name),

  // Unique index
  uniqueEmailIdx: uniqueIndex('unique_email_idx').on(table.email),
}));
```

## Relationships

### One-to-Many

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }),
});

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

### Many-to-Many

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }),
});

// Junction table
export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey(table.userId, table.roleId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));
```

## Enums

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'user', 'moderator']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'processing', 'completed', 'cancelled']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  role: userRoleEnum('role').default('user'),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  status: orderStatusEnum('status').default('pending'),
});
```

## Complete Example

```typescript
// database/schema/users.schema.ts
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  bio: text('bio'),
  avatar: varchar('avatar', { length: 500 }),
  active: boolean('active').default(true),
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  activeIdx: index('users_active_idx').on(table.active),
}));

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

## Type Inference

Use type inference for type safety:

```typescript
// Select type (what you get from database)
type User = typeof users.$inferSelect;
// {
//   id: string;
//   email: string;
//   name: string;
//   createdAt: Date;
//   ...
// }

// Insert type (what you send to database)
type NewUser = typeof users.$inferInsert;
// {
//   id?: string;  // Optional with default
//   email: string;
//   name: string;
//   createdAt?: Date;  // Optional with default
//   ...
// }

// Use in functions
function createUser(data: NewUser): Promise<User> {
  return db.insert(users).values(data).returning();
}
```

## Multi-Tenancy

Add tenant isolation:

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index('users_tenant_idx').on(table.tenantId),
  uniqueEmailPerTenant: unique('unique_email_per_tenant').on(table.tenantId, table.email),
}));
```

## Soft Deletes

Implement soft delete pattern:

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  deletedAt: timestamp('deleted_at'),  // Null = not deleted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  deletedAtIdx: index('users_deleted_at_idx').on(table.deletedAt),
}));
```

## Timestamps

Automatic timestamp management:

```typescript
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),

  // Automatically set on create
  createdAt: timestamp('created_at').defaultNow().notNull(),

  // Must be updated manually in repository
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// In repository
async update(id: string, data: Partial<User>) {
  return db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id));
}
```

## Best Practices

### 1. Use UUIDs for IDs

```typescript
// ✅ Good: UUID primary key
id: uuid('id').defaultRandom().primaryKey()

// ❌ Avoid: Auto-increment (predictable)
id: serial('id').primaryKey()
```

### 2. Index Foreign Keys

```typescript
// ✅ Good: Indexed foreign key
export const posts = pgTable('posts', {
  authorId: uuid('author_id').notNull().references(() => users.id),
}, (table) => ({
  authorIdx: index('posts_author_idx').on(table.authorId),
}));
```

### 3. Timestamps on Every Table

```typescript
// ✅ Good: Timestamps for auditing
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  title: varchar('title', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

### 4. Use Enums for Fixed Values

```typescript
// ✅ Good: Type-safe enum
export const statusEnum = pgEnum('status', ['active', 'inactive']);
export const users = pgTable('users', {
  status: statusEnum('status').default('active'),
});

// ❌ Bad: String without constraint
status: varchar('status', { length: 20 }),
```

### 5. Descriptive Column Names

```typescript
// ✅ Good: Clear names
createdAt: timestamp('created_at')
isActive: boolean('is_active')
userEmail: varchar('user_email')

// ❌ Bad: Unclear names
created: timestamp('created')
flag: boolean('flag')
val: varchar('val')
```

## Next Steps

- [Repositories](./repositories) - Data access layer
- [Migrations](../database/migrations) - Schema migrations
- [Seeders](../database/seeders) - Test data
