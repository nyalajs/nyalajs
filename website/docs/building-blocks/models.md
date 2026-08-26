# Models

`@nyalajs/database` gives you an Active Record-style `Model` base class over Drizzle ORM — `@Table()`/`@Column()` decorators define the schema, `Model` provides `create()`/`find()`/`all()`/`save()`/`delete()`, and `@HasMany()`/`@BelongsTo()`/`@HasOne()`/`@BelongsToMany()` add relations with eager loading. The same model works unchanged across Postgres, MySQL, and SQLite — `SchemaRegistry` builds the right Drizzle table for whichever dialect is connected.

## Basic Model

```typescript
import { Model, Table, Primary, StringColumn, BooleanColumn, TimestampColumn } from '@nyalajs/database';

@Table('users')
export class User extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @StringColumn()
  email!: string;

  @StringColumn()
  name!: string;

  @BooleanColumn()
  active!: boolean;

  @TimestampColumn()
  createdAt!: Date;
}
```

Column property names map directly to database column names — `email` is column `email`, not `snake_case`d automatically. Use `@Column({ name: '...' })` (below) when you want a different DB column name than the property name.

## Column Decorators

```typescript
@Primary()              // marks the primary key
@StringColumn(length?)  // VARCHAR(length) — or TEXT if no length given
@IntColumn()            // INTEGER
@BooleanColumn()        // BOOLEAN (or INTEGER 0/1 on SQLite, handled transparently)
@TimestampColumn()      // TIMESTAMP / Date
@Column(options?)       // the general form — set type/name/isNullable/default/length directly
```

```typescript
interface ColumnDefinition {
  name: string;                                            // DB column name; defaults to the property key
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'json';
  isPrimary?: boolean;
  isNullable?: boolean;
  default?: any;
  length?: number;
}
```

```typescript
@Table('posts')
export class Post extends Model {
  @Primary() @StringColumn() id!: string;

  @StringColumn(500) title!: string;

  // Custom DB column name, nullable
  @Column({ type: 'string', name: 'author_id', isNullable: true })
  authorId?: string;

  @Column({ type: 'json' })
  metadata!: Record<string, any>;
}
```

## CRUD

```typescript
// Create
const user = await User.create({ id: 'u1', email: 'ada@example.com', name: 'Ada', active: true });

// Find by primary key
const found = await User.find('u1'); // User | null

// Find all
const users = await User.all();

// Update — mutate and save()
const user = await User.find('u1');
user!.name = 'Ada Lovelace';
await user!.save();

// save() also inserts when the instance has no id yet
const draft = new User();
draft.email = 'grace@example.com';
await draft.save();

// Delete
const user = await User.find('u1');
await user!.delete();
```

## Relations

### `@HasMany()` / `@HasOne()`

The foreign key lives on the *related* table, pointing back at this model:

```typescript
import { Model, Table, Primary, StringColumn, HasMany, HasOne } from '@nyalajs/database';

@Table('authors')
export class Author extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() name!: string;

  @HasMany(() => Post, 'authorId') // Post.authorId references Author.id
  posts?: Post[];

  @HasOne(() => Profile, 'authorId') // one Profile per Author
  profile?: Profile;
}

@Table('posts')
export class Post extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() authorId!: string;
  @StringColumn() title!: string;
}
```

### `@BelongsTo()`

The inverse — the foreign key lives on *this* table, pointing at the related model:

```typescript
@Table('posts')
export class Post extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() authorId!: string;
  @StringColumn() title!: string;

  @BelongsTo(() => Author, 'authorId')
  author?: Author;
}
```

### `@BelongsToMany()`

Many-to-many, via a pivot table:

```typescript
@Table('authors')
export class Author extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() name!: string;

  @BelongsToMany(() => Tag, {
    pivotTable: 'author_tags',
    foreignKey: 'authorId',      // column on author_tags pointing at Author
    relatedPivotKey: 'tagId',    // column on author_tags pointing at Tag
  })
  tags?: Tag[];
}

@Table('tags')
export class Tag extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() name!: string;
}
```

Relation decorators take a *thunk* (`() => RelatedModel`) rather than the class directly — this lets two models reference each other (e.g. `Author` ↔ `Post`) without an import-order cycle breaking things at module load time.

## Eager Loading

Pass `{ with: [...] }` to `all()`/`find()`, or use the fluent query builder's `.with()` — both run one extra query per relation across the whole result set, never one query per row (no N+1):

```typescript
// Shorthand
const authors = await Author.all({ with: ['posts'] });
const author = await Author.find('a1', { with: ['posts', 'profile'] });

// Fluent query builder
const authors = await Author.query().with('posts', 'tags').get();
```

```typescript
const authors = await Author.all({ with: ['posts'] });
authors[0].posts; // Post[], already loaded — no extra query when you access it
```

### Lazy Loading

If a relation wasn't eager-loaded, load it on demand from an instance:

```typescript
const author = await Author.find('a1');
const posts = await author!.load<Post[]>('posts'); // queries now
author!.posts; // also attached onto the instance
```

## Query Builder

`Model.query()` returns a fluent builder — `.where()`, `.orderBy()`, `.limit()`/`.offset()`, `.with()`, `.get()`/`.first()`:

```typescript
const publishedPosts = await Post.query()
  .where('published', true)
  .with('author')
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get();

const firstMatch = await Post.query().where('authorId', 'a1').first(); // Post | null
```

```typescript
.where(column, value)                 // shorthand for equality
.where(column, operator, value)       // "=" | "!=" | ">" | ">=" | "<" | "<=" | "like" | "ilike" | "in" | "notIn" | "isNull" | "isNotNull"
.whereIn(column, values)
.whereNull(column) / .whereNotNull(column)
.orderBy(column, 'asc' | 'desc')
.limit(n) / .offset(n)
.with(...relationNames)
.get()   // Promise<T[]>
.first() // Promise<T | null>
```

## Multi-Tenancy

Give a model a `tenant_id` column and tenant scoping is automatic and mandatory — every read/write goes through the active tenant from `TenantContext`, and an operation on a tenant-scoped model with no active tenant throws rather than silently returning unscoped data:

```typescript
import { Column } from '@nyalajs/database';

@Table('projects')
export class Project extends Model {
  @Primary() @StringColumn() id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @StringColumn() name!: string;

  @HasMany(() => Task, 'projectId')
  tasks?: Task[];
}
```

```typescript
await TenantContext.run(async () => {
  TenantContext.set('tenant-a');
  await Project.all();        // only tenant-a's projects
  await Project.create({ name: 'New' } as any); // tenant_id stamped automatically
});

await Project.all(); // throws: "Tenant context required" — no tenant active
```

Eager-loaded relations are scoped the same way: a tenant-scoped parent's `@HasMany`/`@HasOne`/`@BelongsTo`/`@BelongsToMany` relation only ever loads that tenant's related rows, even if a related row elsewhere shares the same foreign key value under a different tenant. See [Multi-Tenancy](../multi-tenancy/overview) for the full picture (tenant resolution, isolation guarantees).

## Soft Deletes

Mix in `SoftDeletes` to turn `delete()` into setting a `deletedAt` timestamp instead of removing the row:

```typescript
import { Model, SoftDeletes, Table, Primary, StringColumn } from '@nyalajs/database';

@Table('users')
export class User extends SoftDeletes(Model) {
  @Primary() @StringColumn() id!: string;
  @StringColumn() name!: string;
}
```

```typescript
const user = await User.find('u1');
await user!.delete();      // sets deletedAt, doesn't remove the row
await user!.restore();     // clears deletedAt
await user!.forceDelete(); // actually removes the row
```

## Transactions

`Model` calls made inside `DatabaseService.transaction()` automatically run against that transaction's connection — no need to thread it through manually:

```typescript
await db.transaction(async () => {
  const author = await Author.create({ id: 'a1', name: 'Ada' } as any);
  await Post.create({ id: 'p1', authorId: author.id, title: 'Hello' } as any);
  // both commit together, or both roll back if anything throws
});
```

## Best Practices

### 1. Declare the inverse relation on both sides when you'll query from either direction

```typescript
// ✅ Good: both directions declared, .with() works from either model
@Table('authors')
class Author extends Model {
  @HasMany(() => Post, 'authorId') posts?: Post[];
}
@Table('posts')
class Post extends Model {
  @BelongsTo(() => Author, 'authorId') author?: Author;
}
```

### 2. Prefer eager loading (`.with()`) over `.load()` in a loop

```typescript
// ✅ Good: one extra query total
const authors = await Author.all({ with: ['posts'] });

// ❌ Bad: one query per author
const authors = await Author.all();
for (const author of authors) {
  await author.load('posts');
}
```

### 3. Give every tenant-scoped table a `tenant_id` column, not an app-level filter

```typescript
// ✅ Good: scoping is enforced by Model itself, can't be forgotten
@Column({ name: 'tenant_id' }) tenantId!: string;

// ❌ Bad: relying on every call site to remember to filter manually
await Project.query().where('tenantId', currentTenantId).get();
```

## Next Steps

- [Repositories](./repositories) - Data access layer
- [Multi-Tenancy](../multi-tenancy/overview) - Tenant isolation
