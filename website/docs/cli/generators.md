# Generators

`nyala generate <type> <name>` (alias `nyala g <type> <name>`) writes a single framework artifact into your project's conventional `app/<type>/` folder (or `database/...`, `plugins/...` for a few types) and prints the path it wrote.

```bash
nyala generate <type> <name>
nyala g <type> <name>
```

Fifteen generator subcommands are registered: `controller`, `model`, `migration`, `service`, `repository`, `request`, `policy`, `middleware`, `event`, `listener`, `job`, `resource`, `plugin`, `seeder`, `factory`.

## Naming

Most generators accept a name with or without its conventional suffix — both are normalized to the same output. `nyala generate policy User` and `nyala generate policy UserPolicy` both produce `app/policies/user.policy.ts` exporting `UserPolicy`; the CLI strips the suffix if you already typed it, so you never get a stuttering `UserPolicyPolicy`.

Names are accepted in PascalCase, camelCase, kebab-case, snake_case, or space-separated form — `nyala generate controller create-order` and `nyala generate controller CreateOrder` both produce `app/controllers/create-order.controller.ts` exporting `CreateOrderController`.

## Auto-Registration

Two generators additionally register the class into `bootstrap/app.module.ts`, on a best-effort basis: they insert an `import` statement (if not already present) and append the class name into the module's `controllers: [...]` or `providers: [...]` array (skipping it if it's already listed). This only runs if `bootstrap/app.module.ts` exists in the current project — it's silently skipped otherwise.

- `controller` — appended to `controllers: [...]`
- `service` — appended to `providers: [...]`

Every other generator writes its file only; you wire it up manually (e.g. adding a repository to a service's constructor, or a policy to a controller's guards).

## `nyala generate controller <name>`

Writes `app/controllers/<name>.controller.ts` and registers the class in `bootstrap/app.module.ts`'s `controllers` array.

```bash
nyala generate controller Post
```

Generated `app/controllers/post.controller.ts`:

```typescript
import { Controller, Get, Post } from "@nyalajs/core";

@Controller("/post")
export class PostController {
  @Get("/")
  findAll() {
    return { message: "This action returns all post" };
  }

  @Post("/")
  create() {
    return { message: "This action creates a new post" };
  }
}
```

## `nyala generate model <name>`

Writes `app/models/<name>.model.ts`. Unlike most other types, model files carry no class-name suffix (the class is just `<Name>`, not `<Name>Model`).

```bash
nyala generate model Post
```

Generated `app/models/post.model.ts`:

```typescript
import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

@Table("posts")
export class Post extends Model {
  @Primary()
  @StringColumn()
  id!: string;

  @TimestampColumn()
  createdAt!: Date;

  @TimestampColumn()
  updatedAt!: Date;
}
```

## `nyala generate migration <name>`

Writes a timestamped file into `database/migrations/`, not a file named after `<name>` alone — the filename is `<YYYYMMDDHHMMSS>_<kebab-name>.ts`, so migration files always sort chronologically.

```bash
nyala generate migration create_posts_table
```

Creates something like `database/migrations/20260727143210_create-posts-table.ts`:

```typescript
import { sql } from "drizzle-orm";

export async function up(db: any): Promise<void> {
  // TODO: implement migration for create_posts_table
  // await db.execute(sql`CREATE TABLE ...`);
}

export async function down(db: any): Promise<void> {
  // TODO: reverse migration for create_posts_table
}
```

These `up`/`down` exports are exactly what [`nyala db:migrate` and `nyala db:rollback`](./commands#connection-resolution) load and execute — fill them in with real Drizzle statements before migrating.

## `nyala generate service <name>`

Writes `app/services/<name>.service.ts` and registers the class in `bootstrap/app.module.ts`'s `providers` array.

```bash
nyala generate service Post
```

Generated `app/services/post.service.ts`:

```typescript
import { Injectable } from "@nyalajs/core";

@Injectable()
export class PostService {
  // Add your business logic here
}
```

## `nyala generate repository <name>`

Writes `app/repositories/<name>.repository.ts` with a `DatabaseService` injected and empty `findAll`/`findById` stubs to fill in.

```bash
nyala generate repository Post
```

Generated `app/repositories/post.repository.ts`:

```typescript
import { Injectable } from "@nyalajs/core";
import { DatabaseService } from "@nyalajs/database";

@Injectable()
export class PostRepository {
  constructor(private readonly dbService: DatabaseService) {}

  async findAll() {
    // const db = this.dbService.getDb();
    // return await db.select().from(tableName);
  }

  async findById(id: string | number) {
    // ...
  }
}
```

## `nyala generate request <name>`

Writes `app/requests/<name>.request.ts` — a Zod schema plus an empty class, intended as the shape for validated request bodies.

```bash
nyala generate request CreatePost
```

Generated `app/requests/create-post.request.ts`:

```typescript
import { z } from "zod";
import { ApiProperty } from "@nyalajs/http";

export const CreatePostRequestSchema = z.object({
  // TODO: Define validation rules
  // email: z.string().email(),
});

export class CreatePostRequest {
  // @ApiProperty({ description: "Example property", type: "string" })
  // public propertyName!: string;
}
```

## `nyala generate policy <name>`

Writes `app/policies/<name>.policy.ts` implementing the `Guard` interface from `@nyalajs/http`.

```bash
nyala generate policy Post
```

Generated `app/policies/post.policy.ts`:

```typescript
import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException } from "@nyalajs/http";

@Injectable()
export class PostPolicy implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.context.metadata.get("user");

    if (!user) {
      throw new ForbiddenException("Not authorized");
    }

    // TODO: implement the authorization rule for post
    return true;
  }
}
```

## `nyala generate middleware <name>`

Writes `app/middleware/<name>.middleware.ts`.

```bash
nyala generate middleware RequestLogger
```

Generated `app/middleware/request-logger.middleware.ts`:

```typescript
import { Injectable } from "@nyalajs/core";
import { ExecutionContext } from "@nyalajs/http";

@Injectable()
export class RequestLoggerMiddleware {
  async use(ctx: ExecutionContext, next: () => Promise<void>): Promise<void> {
    // TODO: implement request-logger middleware logic
    await next();
  }
}
```

## `nyala generate event <name>`

Writes `app/events/<name>.event.ts` — a plain class carrying an untyped payload.

```bash
nyala generate event PostPublished
```

Generated `app/events/post-published.event.ts`:

```typescript
export class PostPublishedEvent {
  constructor(public readonly payload: Record<string, unknown> = {}) {}
}
```

## `nyala generate listener <name>`

Writes `app/listeners/<name>.listener.ts`, decorated with `@EventHandler` from `@nyalajs/events`.

```bash
nyala generate listener SendWelcomeEmail
```

Generated `app/listeners/send-welcome-email.listener.ts`:

```typescript
import { Injectable } from "@nyalajs/core";
import { EventHandler } from "@nyalajs/events";

@Injectable()
export class SendWelcomeEmailListener {
  @EventHandler("example.event")
  async handle(event: unknown): Promise<void> {
    // TODO: react to the event
  }
}
```

## `nyala generate job <name>`

Writes `app/jobs/<name>.job.ts`, decorated with `@Process` from `@nyalajs/queue` (BullMQ-backed).

```bash
nyala generate job SendInvoiceEmail
```

Generated `app/jobs/send-invoice-email.job.ts`:

```typescript
import { Process } from "@nyalajs/queue";
import type { Job } from "bullmq";

export class SendInvoiceEmailJob {
  /**
   * Handle the queued job.
   * Dispatch with: dispatch("send-invoice-email", "SendInvoiceEmailJob", { ...payload })
   */
  @Process("send-invoice-email")
  async handle(job: Job): Promise<void> {
    const data = job.data;
    // TODO: implement background work for send-invoice-email
    console.log("[SendInvoiceEmailJob] Processing job", data);
  }
}
```

## `nyala generate resource <name>`

Writes `app/resources/<name>.resource.ts` — a static shaper for turning a model/entity into the JSON your API returns, meant to be called manually from a controller.

```bash
nyala generate resource Post
```

Generated `app/resources/post.resource.ts`:

```typescript
// A resource shapes a model/entity into the JSON your API returns.
// Wire it into a controller manually, e.g.:
//   return PostResource.collection(items);
export class PostResource {
  static make(item: any) {
    return {
      // TODO: pick the fields to expose
      id: item.id,
    };
  }

  static collection(items: any[]) {
    return items.map((item) => PostResource.make(item));
  }
}
```

## `nyala generate plugin <name>`

Writes `plugins/<kebab-name>/index.ts` implementing `NyalaPlugin`. Unlike the other generators, this one fails loudly if the target directory already exists rather than overwriting it.

```bash
nyala generate plugin Analytics
```

Generated `plugins/analytics/index.ts`:

```typescript
import { NyalaPlugin, NyalaApplication } from "@nyalajs/core";

export default class AnalyticsPlugin implements NyalaPlugin {
  name = "Analytics";

  /**
   * Called once during application boot (before HTTP server starts).
   * Register services, routes, or middleware here.
   */
  async register(app: NyalaApplication): Promise<void> {
    // TODO: register plugin services
    // app.get(SomeService).configure({...});
    console.log("[Analytics] Plugin registered.");
  }

  /**
   * Called after all plugins are registered.
   * Safe to depend on other plugins here.
   */
  async boot(app: NyalaApplication): Promise<void> {
    // TODO: run post-registration startup logic
  }
}
```

## `nyala generate seeder <name>`

Writes `database/seeders/<name>.seeder.ts`, extending `Seeder` from `@nyalajs/database`. This is what [`nyala db:seed`](./commands#nyala-db-seed) discovers and runs.

```bash
nyala generate seeder Post
```

Generated `database/seeders/post.seeder.ts`:

```typescript
import { Seeder } from "@nyalajs/database";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

export default class PostSeeder extends Seeder {
    /**
     * Run the database seeds.
     */
    async run(db: NodePgDatabase): Promise<void> {
        // TODO: insert seed data
        // await db.insert(users).values({ ... });
    }
}
```

## `nyala generate factory <name>`

Writes `database/factories/<name>.factory.ts`, extending `Factory<T>` from `@nyalajs/database`, for generating fake model instances (e.g. in tests or seeders).

```bash
nyala generate factory Post
```

Generated `database/factories/post.factory.ts`:

```typescript
import { Factory } from "@nyalajs/database";
// import { Post } from "../../app/models/post";

export class PostFactory extends Factory<any /* Post */> {
    model = Object as any; // TODO: replace with Post

    /**
     * Define the model's default state.
     */
    definition(): any /* Partial<Post> */ {
        return {
            // TODO: define default attributes
        };
    }
}
```

## Reference Table

| Subcommand | File written | Suffix | Auto-registered? |
|---|---|---|---|
| `controller <name>` | `app/controllers/<name>.controller.ts` | `Controller` | Yes — `app.module.ts` `controllers` |
| `model <name>` | `app/models/<name>.model.ts` | *(none)* | No |
| `migration <name>` | `database/migrations/<timestamp>_<name>.ts` | *(none, timestamped)* | No |
| `service <name>` | `app/services/<name>.service.ts` | `Service` | Yes — `app.module.ts` `providers` |
| `repository <name>` | `app/repositories/<name>.repository.ts` | `Repository` | No |
| `request <name>` | `app/requests/<name>.request.ts` | `Request` | No |
| `policy <name>` | `app/policies/<name>.policy.ts` | `Policy` | No |
| `middleware <name>` | `app/middleware/<name>.middleware.ts` | `Middleware` | No |
| `event <name>` | `app/events/<name>.event.ts` | `Event` | No |
| `listener <name>` | `app/listeners/<name>.listener.ts` | `Listener` | No |
| `job <name>` | `app/jobs/<name>.job.ts` | `Job` | No |
| `resource <name>` | `app/resources/<name>.resource.ts` | `Resource` | No |
| `plugin <name>` | `plugins/<kebab-name>/index.ts` | *(class suffixed `Plugin`)* | No |
| `seeder <name>` | `database/seeders/<name>.seeder.ts` | `Seeder` | No |
| `factory <name>` | `database/factories/<name>.factory.ts` | `Factory` | No |

## What These Generators Assume

Several of the generated stubs (`model`, `repository`, `migration`, `request`, `event`, `listener`, `job`, `plugin`) reference framework packages or subsystems your project may or may not have installed yet, depending on which template you started from (`@nyalajs/database`, `@nyalajs/events`, `@nyalajs/queue`). Check [Templates](./templates) for what each starter includes out of the box, and add the relevant `@nyalajs/*` package if a generated file's imports don't resolve.

## See Also

- [Commands](./commands) — every other CLI command
- [Templates](./templates) — starter project structures
