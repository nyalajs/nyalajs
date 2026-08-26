# @nyalajs/database

Drizzle-backed ORM for Nyala.js — an Active Record-style `Model` over Drizzle, with `@Table()`/`@Column()` schema decorators, relations, a fluent query builder, migrations, and mandatory tenant scoping. The same model works unchanged across Postgres, MySQL, and SQLite.

## Quick start

```ts
import { Model, Table, Primary, StringColumn, BooleanColumn } from "@nyalajs/database";

@Table("users")
export class User extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() email!: string;
  @BooleanColumn() active!: boolean;
}

const user = await User.create({ id: "u1", email: "ada@example.com", active: true });
const found = await User.find("u1");
const all = await User.all();

found!.active = false;
await found!.save();
await found!.delete();
```

Connect a real driver during bootstrap:

```ts
import { DatabaseService } from "@nyalajs/database";

const db = app.get(DatabaseService);
await db.connect({ driver: "pg", connectionString: process.env.DATABASE_URL! });
Model.setDatabase(db.getDb());
```

Supported drivers: `pg` (node-postgres), `postgres` (postgres-js), `mysql2`, `better-sqlite3` — each is an optional peer dependency, install only the one(s) you use.

## Relations

```ts
import { HasMany, BelongsTo } from "@nyalajs/database";

@Table("authors")
class Author extends Model {
  @Primary() @StringColumn() id!: string;

  @HasMany(() => Post, "authorId")
  posts?: Post[];
}

@Table("posts")
class Post extends Model {
  @Primary() @StringColumn() id!: string;
  @StringColumn() authorId!: string;

  @BelongsTo(() => Author, "authorId")
  author?: Author;
}
```

`@HasMany()`/`@HasOne()`/`@BelongsTo()`/`@BelongsToMany()` — eager-load with `{ with: [...] }` or the query builder's `.with()`, always batched (one extra query per relation, never per row):

```ts
const authors = await Author.all({ with: ["posts"] });
const author = await Author.query().where("active", true).with("posts").first();
```

Relations are tenant-scoped automatically, same as the main query — no cross-tenant leakage through a relation.

## Query builder

```ts
const results = await Post.query()
  .where("published", true)
  .with("author")
  .orderBy("createdAt", "desc")
  .limit(10)
  .get();
```

## Multi-tenancy

Give a model a `tenant_id` column and every read/write is scoped to the active `TenantContext` automatically — an operation on a tenant-scoped model with no active tenant throws rather than silently returning unscoped data:

```ts
import { Column } from "@nyalajs/database";

@Table("projects")
class Project extends Model {
  @Primary() @StringColumn() id!: string;
  @Column({ name: "tenant_id" }) tenantId!: string;
}
```

## Transactions

```ts
await db.transaction(async () => {
  const author = await Author.create({ id: "a1" } as any);
  await Post.create({ id: "p1", authorId: author.id } as any);
  // both commit together, or roll back together
});
```

## Soft deletes

```ts
import { SoftDeletes } from "@nyalajs/database";

@Table("users")
class User extends SoftDeletes(Model) {
  @Primary() @StringColumn() id!: string;
}

await user.delete();  // sets deletedAt
await user.restore(); // clears it
```

## Documentation

Full docs: [github.com/nyalajs/nyalajs](https://github.com/nyalajs/nyalajs/blob/main/website/docs/building-blocks/models.md).
