# @nyalajs/graphql

Code-first GraphQL for Nyala.js. `@Resolver()`/`@Query()`/`@Mutation()`/`@Subscription()` classes are resolved through the same DI container, multi-tenancy pipeline, and `@UseGuards()`/`@UseInterceptors()`/`@UseFilters()` decorators as `@nyalajs/http` controllers and `@nyalajs/microservices` message patterns — one guard implementation can protect a REST route, a message pattern, and a GraphQL field.

## Quick start

```ts
import { ObjectType, Field, ID, Resolver, Query, Args } from "@nyalajs/graphql";

@ObjectType()
class User {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
}

@Injectable()
@Resolver()
class UserResolver {
  constructor(private users: UsersService) {}

  @Query(() => [User])
  users() {
    return this.users.findAll();
  }

  @Query(() => User, { nullable: true })
  user(@Args("id", () => ID) id: string) {
    return this.users.findOne(id);
  }
}
```

```ts
import { FastifyAdapter } from "@nyalajs/http";
import { GraphqlServer, mountGraphqlServer } from "@nyalajs/graphql";

const httpAdapter = new FastifyAdapter();
const server = new GraphqlServer(kernel, { resolvers: [UserResolver] });
await mountGraphqlServer(httpAdapter.getInstance(), server);
// GET/POST /graphql now serves the schema, plus GraphiQL in dev.
```

Resolvers, guards, interceptors, and filters must all be registered as DI providers in your module — the dispatcher resolves them through `Container.resolve()`, same as any other injectable:

```ts
@Module({ providers: [UserResolver, AdminOnlyGuard] })
class AppModule {}
```

## Why a required type thunk

`@Field(() => String)` always needs its thunk — there's no `@Field()` bare-form fallback. TypeScript's `design:type` reflect-metadata (the mechanism NestJS's/TypeGraphQL's optional-thunk convenience relies on) is only emitted by `tsc` with `emitDecoratorMetadata`, and is silently absent under esbuild/SWC-based dev/test tooling. A bare `@Field()` would work in a production `tsc` build and silently resolve to `undefined` everywhere else — the thunk is required so a missing type fails loudly and consistently instead.

The same convention applies to `@Query()`, `@Mutation()`, `@Subscription()`, `@Args(name, type)`, and `@ResolveField()` return types. List types use the `() => [User]` array-literal shorthand (TypeGraphQL's own convention) rather than a separate `{ list: true }` option, though `{ list: true }` is still honored if you prefer spelling it out.

## Guards, interceptors, filters

```ts
@Query(() => Secret)
@UseGuards(AdminOnlyGuard)
@UseInterceptors(LoggingInterceptor)
adminSecret() { ... }
```

`GraphqlGuard`/`GraphqlInterceptor`/`GraphqlExceptionFilter` mirror `@nyalajs/http`'s `Guard`/`Interceptor`/exception filter contracts exactly, retargeted to a `GraphqlExecutionContext` (`{ args, parent, ctx, info, container, resolverClass, handlerName, operationKind }`) instead of an HTTP request/response. A guard returning `false` throws `GraphqlPermissionDeniedError`, which — per GraphQL's own null-propagation rules — nulls the whole response's `data` if the blocked field isn't nullable, not just that one field.

## Field resolvers (`@ResolveField`)

```ts
@Injectable()
@Resolver(() => Post)
class PostFieldResolver {
  @ResolveField(() => User, { nullable: true })
  async author(@Parent() post: Post, @Ctx() ctx: GraphqlContext) {
    let loader = ctx.loaders.get(PostFieldResolver);
    if (!loader) {
      loader = createLoader(async (ids: readonly string[]) => {
        const users = await this.users.findByIds(ids);
        return ids.map((id) => users.find((u) => u.id === id) ?? null);
      });
      ctx.loaders.set(PostFieldResolver, loader);
    }
    return loader.load(post.authorId);
  }
}
```

`@ResolveField()` either overrides a field the target `@ObjectType()` already declares with `@Field()`, or adds an entirely new field the class has no property for (the common case — `Post.author` computed from `Post.authorId`). A return type thunk is required unless overriding an already-`@Field()`-declared field.

## DataLoader batching (N+1)

`ctx.loaders` is a fresh `Map` every request — create and cache loaders there, never at module scope. A module-level DataLoader is a cross-tenant data leak waiting to happen: it would cache across requests and across tenants, so tenant B's resolver could receive a row DataLoader cached from tenant A's query.

## Multi-tenancy

```ts
const server = new GraphqlServer(kernel, {
  resolvers: [...],
  tenantResolvers: [new HeaderTenantResolver(), new JwtTenantResolver()],
});
```

Works with `@nyalajs/tenancy`'s real resolvers directly (or any object implementing `resolve(request): Promise<string | undefined>`). Each request runs inside its own `TenantContext.run()`/`LogContext.run()` scope, exactly like `@nyalajs/http`'s `FastifyAdapter` — `TenantContext.get()` inside a resolver, or inside a service/`Model` a resolver calls into, behaves identically whether reached via REST or GraphQL.

## Subscriptions

```ts
@Subscription(() => Tick)
async *ticks() {
  while (true) {
    yield { count: ++n };
    await sleep(1000);
  }
}
```

Delivered over Server-Sent Events through the same `/graphql` endpoint (`accept: text/event-stream`) — no separate WebSocket server. A resolver method returning an `AsyncGenerator`/`AsyncIterable` is the subscribe step by default; pass `{ subscribe: "methodName" }` to split subscribe and resolve into separate methods.

## Error masking

Unset by default — matching graphql-yoga's own safe default, an unexpected resolver error's message is replaced with `"Unexpected error."` in the response rather than leaking internal detail (stack traces, database error text) to API clients. Set `maskedErrors: false` on `GraphqlServerOptions` for local development, or if every error your resolvers throw is already meant to be shown verbatim.

## Peer dependencies

`graphql` is a direct dependency. `graphql-yoga` is an optional peer dependency — only required if you call `mountGraphqlServer()`. Pin `graphql-yoga` to the `^5.x` line.

```bash
npm install graphql-yoga
```

### A note on graphql-js and Vitest

`graphql-js` ships both a CJS build and an ESM build with no unifying `exports` map. If your resolvers/schema-builder code and `graphql-yoga`'s own internals end up loading different copies (one via `require`, one via `import`), `graphql-js`'s own runtime identity checks reject a real schema as "from another module or realm." If you hit this under Vitest, alias `graphql` to its resolved path in `vitest.config.ts`:

```ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: { alias: { graphql: require.resolve("graphql") } },
});
```

## What's NOT included

- **No schema stitching/federation** — one `GraphqlServer` builds one schema from the resolver classes you list. Composing multiple services' schemas into one graph (Apollo Federation-style) is out of scope.
- **No automatic persisted queries / query allowlisting** — bring your own graphql-yoga plugin if you need this.
- **No built-in rate limiting per-field** — use a `GraphqlInterceptor` or `GraphqlGuard`, or rate-limit at the HTTP layer in front of `/graphql`.
