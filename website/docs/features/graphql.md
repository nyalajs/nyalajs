# GraphQL

`@nyalajs/graphql` adds code-first GraphQL to Nyala — `@Resolver()`/`@Query()`/`@Mutation()`/`@Subscription()` classes resolved through the same DI container, multi-tenancy pipeline, and `@UseGuards()`/`@UseInterceptors()`/`@UseFilters()` decorators as HTTP controllers and microservices message patterns. One guard implementation can protect a REST route, a message pattern, and a GraphQL field.

## Quick start

```typescript
import { Injectable } from '@nyalajs/core';
import { ObjectType, Field, ID, Resolver, Query, Args } from '@nyalajs/graphql';

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
  user(@Args('id', () => ID) id: string) {
    return this.users.findOne(id);
  }
}
```

Mount it onto the same Fastify instance your HTTP routes run on:

```typescript
import { FastifyAdapter } from '@nyalajs/http';
import { GraphqlServer, mountGraphqlServer } from '@nyalajs/graphql';

const httpAdapter = new FastifyAdapter();
const server = new GraphqlServer(kernel, { resolvers: [UserResolver] });
await mountGraphqlServer(httpAdapter.getInstance(), server);
// GET/POST /graphql now serves the schema, plus GraphiQL in dev.
```

Resolvers, guards, interceptors, and filters must all be registered as DI providers — the dispatcher resolves them through `Container.resolve()`, same as any other injectable:

```typescript
@Module({ providers: [UserResolver, AdminOnlyGuard] })
class AppModule {}
```

## Field type thunks are required

`@Field(() => String)` always needs its thunk — unlike some code-first GraphQL libraries, there's no bare `@Field()` fallback. TypeScript's `design:type` reflect-metadata (the mechanism an optional-thunk convenience would rely on) is only emitted by `tsc` with `emitDecoratorMetadata`, and is silently absent under esbuild/SWC-based dev and test tooling. A bare `@Field()` would work in a production `tsc` build and silently resolve to `undefined` everywhere else — the thunk is required so a missing type fails loudly and consistently, regardless of how the code was compiled.

The same convention applies to `@Query()`, `@Mutation()`, `@Subscription()`, `@Args(name, type)`, and `@ResolveField()` return types. Lists use the `() => [User]` array-literal shorthand rather than a separate option:

```typescript
@Field(() => [Post], { nullable: true })
posts!: Post[] | null;
```

## Guards, interceptors, filters

```typescript
@Query(() => Secret)
@UseGuards(AdminOnlyGuard)
@UseInterceptors(LoggingInterceptor)
adminSecret() { ... }
```

```typescript
export interface GraphqlGuard {
  canActivate(context: GraphqlExecutionContext): Promise<boolean> | boolean;
}

export interface GraphqlInterceptor {
  intercept(context: GraphqlExecutionContext, next: () => Promise<any>): Promise<any>;
}

export interface GraphqlExceptionFilter {
  catch(error: Error, context: GraphqlExecutionContext): any;
}
```

These mirror `@nyalajs/http`'s `Guard`/`Interceptor`/exception filter contracts exactly, retargeted to a `GraphqlExecutionContext` (`{ args, parent, ctx, info, container, resolverClass, handlerName, operationKind }`) instead of an HTTP request/response — because the underlying `@UseGuards()`/`@UseInterceptors()`/`@UseFilters()` decorators and the metadata they write are shared with `@nyalajs/core`, not GraphQL-specific.

A guard returning `false` throws `GraphqlPermissionDeniedError`. Per GraphQL's own null-propagation rules, this nulls the *entire response's* `data` if the blocked field's return type isn't nullable — not just that one field. Mark a field `{ nullable: true }` if you want a denied field to resolve to `null` alongside a partial, otherwise-successful response instead.

## Field resolvers (`@ResolveField`)

Compute a field that doesn't exist as a plain property — e.g. loading a relation:

```typescript
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

`@ResolveField()` either overrides a field the target `@ObjectType()` already declares with `@Field()` (matched by name), or adds an entirely new field the class has no property for at all — the common case, `Post.author` computed from `Post.authorId`. A return type thunk is required unless overriding an already-`@Field()`-declared field, since there's nothing else to source the type from.

## DataLoader batching (the N+1 problem)

`ctx.loaders` is a fresh `Map` on every request — create and cache loaders there, as shown above, never at module scope:

```typescript
// WRONG — module-level loader shared across every request and every tenant.
const userLoader = createLoader(async (ids) => { ... });
```

A shared/module-level DataLoader is a cross-tenant data leak waiting to happen: it caches across requests, so tenant B's resolver could receive a row DataLoader response cached from tenant A's earlier query. Always read-or-create the loader from `ctx.loaders`.

## Multi-tenancy

```typescript
import { HeaderTenantResolver, JwtTenantResolver } from '@nyalajs/tenancy';

const server = new GraphqlServer(kernel, {
  resolvers: [UserResolver],
  tenantResolvers: [new HeaderTenantResolver(), new JwtTenantResolver()],
});
```

Works with `@nyalajs/tenancy`'s real resolvers directly — `tenantResolvers` accepts anything implementing `resolve(request): Promise<string | undefined>`, the same contract `TenantMiddleware` uses on the HTTP side. Each request runs inside its own `TenantContext.run()`/`LogContext.run()` scope, exactly like `FastifyAdapter` — `TenantContext.get()` inside a resolver, or inside a service/`Model` a resolver calls into, behaves identically whether that code path was reached via REST or GraphQL. A resolver failing to check `TenantContext.get()` before querying is exactly as unsafe here as it would be in a REST controller — the same fail-closed discipline applies.

## Subscriptions

```typescript
@Injectable()
@Resolver()
class TickResolver {
  @Subscription(() => Tick)
  async *ticks() {
    let n = 0;
    while (true) {
      yield { count: ++n };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
```

Delivered over Server-Sent Events through the same `/graphql` endpoint (a client sends `accept: text/event-stream`) — no separate WebSocket server or port to run. A resolver method returning an `AsyncGenerator`/`AsyncIterable` is the subscribe step by default; pass `{ subscribe: 'methodName' }` to `@Subscription()` to split subscribe and resolve into two separate methods (subscribe produces the raw event stream, the decorated method reshapes each value).

## Error masking

Unset by default — matching graphql-yoga's own safe default: an unexpected resolver error's message is replaced with `"Unexpected error."` in the client-facing response, instead of leaking internal detail (stack traces, database error text) to API clients. `GraphqlExceptionFilter` still runs first and can supply a deliberate, safe value or message for errors you expect. Set `maskedErrors: false` on `GraphqlServerOptions` only for local development, or if every error your resolvers throw is already meant to be shown to callers verbatim.

## Peer dependencies

`graphql` is a direct dependency of `@nyalajs/graphql`. `graphql-yoga` is an optional peer dependency, only required if you call `mountGraphqlServer()`:

```bash
npm install graphql-yoga
```

Pin `graphql-yoga` to the `^5.x` line.

## What's NOT Included

- **No schema stitching/federation** — one `GraphqlServer` builds one schema from the resolver classes you list it. Composing multiple services' schemas into one graph (Apollo Federation-style) is out of scope.
- **No automatic persisted queries or query allowlisting** — bring your own graphql-yoga plugin if you need this.
- **No built-in per-field rate limiting** — use a `GraphqlInterceptor` or `GraphqlGuard`, or rate-limit at the HTTP layer in front of `/graphql`.

## Next Steps

- [Microservices](./microservices) - Message-pattern RPC, sharing the same guard/interceptor contracts
- [Multi-Tenancy](../multi-tenancy/overview) - Tenant isolation, including across GraphQL resolvers
- [WebSockets](./websockets) - Real-time bidirectional connections outside GraphQL's subscription model
