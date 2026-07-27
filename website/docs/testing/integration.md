# Integration Tests

Integration tests check that your providers are wired together correctly through Nyala's real DI container — that a controller actually resolves the service it declares, that overriding a provider actually takes effect, that a module's shape (`imports`, `providers`, `controllers`) compiles the way you expect. `@nyalajs/testing` provides `TestingModule` for exactly this.

## The `TestingModule` Helper

`TestingModule` and its builder, `TestingModuleBuilder`, live in `@nyalajs/testing` and wrap `@nyalajs/core`'s `NyalaFactory` — the same machinery your app's `bootstrap/main.ts` uses — so a compiled testing module is a real, fully wired `NyalaApplication`, not a simplified stand-in.

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { TestingModule } from '@nyalajs/testing';
```

## Building a Testing Module

`TestingModule.create(metadata)` accepts the same shape as `@Module()`: `imports`, `providers`, and `controllers`. Call `.compile()` to build it into a running application:

```typescript
const moduleRef = await TestingModule.create({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
}).compile();
```

Under the hood, `.compile()`:

1. Wraps your metadata in a generated `RootTestModule` class decorated with `@Module()`.
2. Runs it through `NyalaFactory.create()`, exactly like a real app boot.
3. Attaches a `FastifyAdapter` (with sessions disabled by default) and binds routes.
4. Returns a `TestingModule` wrapping the resulting `NyalaApplication`.

That means anything that works at app-boot time — DI resolution order, constructor injection across your whole provider graph, route binding — is exercised for real in a compiled testing module.

## Resolving Providers with `.get<T>()`

Once compiled, pull any registered provider or controller straight out of the container:

```typescript
const moduleRef = await TestingModule.create({
  providers: [UsersService, UsersRepository],
}).compile();

const usersService = moduleRef.get<UsersService>(UsersService);

const user = await usersService.create({ email: 'a@example.com', password: 'x' });
expect(user.email).toBe('a@example.com');
```

This is the core of an integration test: you're not calling `new UsersService(...)` yourself (that's a unit test — see [Unit Tests](./unit)) — you're asking the *container* for it, so any dependency `UsersService` declares in its constructor gets resolved by the same rules your real app uses.

You can also fetch a controller and confirm it received a working service instance:

```typescript
const controller = moduleRef.get<UsersController>(UsersController);
expect(controller).toBeInstanceOf(UsersController);
```

## Overriding Providers

The whole point of testing at this layer is usually to keep *most* of the graph real while swapping out one edge — typically the database-backed repository — for a fake. `overrideProvider(token, useValue)` does this before `.compile()` runs:

```typescript
const fakeUsersRepo = {
  findByEmail: async () => null,
  create: async (data: any) => ({ id: 'u1', ...data }),
};

const moduleRef = await TestingModule.create({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
  .overrideProvider(UsersRepository, fakeUsersRepo)
  .compile();

const usersService = moduleRef.get<UsersService>(UsersService);
const user = await usersService.create({ email: 'a@example.com', password: 'x' } as any);

expect(user.id).toBe('u1');
```

`overrideProvider` looks for an existing entry matching the token (either a bare class in `providers`, or an object with `provide: token`) and replaces it with `{ provide: token, useValue }`; if no matching entry exists yet, it appends one. So you can also use it to inject a provider that wasn't declared in the module at all — useful for satisfying a dependency you don't want to construct for real (an external API client, a payment gateway).

```typescript
.overrideProvider(PaymentGateway, {
  charge: async () => ({ id: 'pay_test_123', status: 'succeeded' }),
})
```

:::warning
`overrideProvider` must be called *before* `.compile()` — the builder mutates the module's provider list, and compiling locks it in by handing the metadata to `NyalaFactory.create()`.
:::

## Real Example: Controller + Service + Overridden Repository

This is adapted from `packages/testing/src/__tests__/testing-module.spec.ts`, the framework's own test of this exact machinery, extended to a controller/service pair:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Controller, Get, Post, Body, Injectable } from '@nyalajs/core';
import { TestingModule } from '@nyalajs/testing';

@Injectable()
class WidgetsRepository {
  async findAll() {
    throw new Error('not implemented — this should be overridden in tests');
  }
}

@Injectable()
class WidgetsService {
  constructor(private repo: WidgetsRepository) {}

  async list() {
    return this.repo.findAll();
  }
}

@Controller('/widgets')
class WidgetsController {
  constructor(private widgetsService: WidgetsService) {}

  @Get('/')
  async index() {
    return { widgets: await this.widgetsService.list() };
  }
}

describe('WidgetsController integration', () => {
  it('resolves WidgetsController -> WidgetsService -> WidgetsRepository through the real container', async () => {
    const moduleRef = await TestingModule.create({
      controllers: [WidgetsController],
      providers: [WidgetsService, WidgetsRepository],
    })
      .overrideProvider(WidgetsRepository, {
        findAll: async () => ['a', 'b'],
      })
      .compile();

    const controller = moduleRef.get<WidgetsController>(WidgetsController);
    const result = await controller.index();

    expect(result).toEqual({ widgets: ['a', 'b'] });
  });
});
```

`WidgetsController` never sees a mock directly — it only knows about `WidgetsService`, which only knows about `WidgetsRepository`. The override happens at the edge of the graph, and the container threads the fake through both real layers above it.

## Reaching the Underlying Application

`moduleRef.createNyalaApplication()` returns the raw `NyalaApplication` the module compiled into. You'll rarely need this directly in an integration test — it's mainly there so `HttpTestClient` can wrap it:

```typescript
import { HttpTestClient } from '@nyalajs/testing';

const client = new HttpTestClient(moduleRef.createNyalaApplication());
const res = await client.get('/widgets');

expect(res.statusCode).toBe(200);
expect(res.json()).toEqual({ widgets: ['a', 'b'] });
```

Because `.compile()` already binds routes, a compiled `TestingModule` is HTTP-ready the moment it's built. Using `HttpTestClient` this way — inside an otherwise DI-focused test — is exactly what `testing-module.spec.ts` does, and it's a natural way to confirm that routing itself (not just the constructor graph) is wired correctly:

```typescript
it('returns 404 for a route that was never registered', async () => {
  const moduleRef = await TestingModule.create({
    controllers: [WidgetsController],
  }).compile();

  const client = new HttpTestClient(moduleRef.createNyalaApplication());
  const res = await client.get('/does-not-exist');

  expect(res.statusCode).toBe(404);
});
```

For tests where HTTP behavior (status codes, headers, request bodies, guards running on real requests) is the actual point rather than a side check, see [E2E Tests](./e2e), which covers `HttpTestClient` in depth.

## Testing Guards and Modules Together

Because `.compile()` runs the real module system, guards registered via `@UseGuards()` on a controller run for real too when you go through `HttpTestClient` — there's no special-casing to disable them. If a guard depends on a provider (like `AuthGuard` depending on `JwtService`), declare or override that provider the same way:

```typescript
const moduleRef = await TestingModule.create({
  controllers: [ProfileController], // has @UseGuards(AuthGuard)
  providers: [AuthGuard],
})
  .overrideProvider(JwtService, {
    verify: (token: string) => {
      if (token !== 'valid-token') throw new Error('invalid');
      return { sub: 'user-1' };
    },
  })
  .compile();

const client = new HttpTestClient(moduleRef.createNyalaApplication());
const res = await client.get('/profile', { authorization: 'Bearer valid-token' });

expect(res.statusCode).toBe(200);
```

## Importing Other Modules

Because `ModuleMetadata` supports `imports` alongside `providers` and `controllers`, a testing module can pull in a real feature module the same way your app's root module does, instead of re-listing every provider by hand:

```typescript
interface ModuleMetadata {
  imports?: Type[];
  providers?: ProviderDefinition[];
  controllers?: Type[];
  exports?: (Type | string | symbol)[];
}
```

```typescript
import { UsersModule } from '../modules/users.module';

const moduleRef = await TestingModule.create({
  imports: [UsersModule],
})
  .overrideProvider(UsersRepository, fakeUsersRepo)
  .compile();
```

This keeps the test close to how the module is actually composed in production — you're not duplicating its `providers`/`controllers` list in every test file, just overriding the one edge (`UsersRepository`) you want faked.

## Provider Shapes

`providers` in the module metadata accepts either a bare class (Nyala registers it as `{ provide: TheClass, useClass: TheClass }` implicitly) or an explicit provider object:

```typescript
providers: [
  UsersService,                              // shorthand: class as its own token
  { provide: UsersRepository, useClass: PostgresUsersRepository },
  { provide: 'API_KEY', useValue: 'test-key' },
  {
    provide: PaymentGateway,
    useFactory: () => new StripeGateway(process.env.STRIPE_TEST_KEY),
  },
]
```

`overrideProvider()` works the same way regardless of which shape the original entry used — it matches on the token (`p === token` for a bare class, `p.provide === token` for an object form) and replaces the whole entry with `{ provide: token, useValue }`.

## Testing Rejection Paths Through the Container

Integration tests are also the right place to confirm that an error thrown deep in the graph (say, by an overridden repository) actually surfaces correctly through a service that wraps it in a framework exception:

```typescript
it('propagates NotFoundException when the repository returns nothing', async () => {
  const moduleRef = await TestingModule.create({
    providers: [UsersService, UsersRepository],
  })
    .overrideProvider(UsersRepository, { findById: async () => null })
    .compile();

  const usersService = moduleRef.get<UsersService>(UsersService);

  await expect(usersService.findById('missing')).rejects.toThrow('User not found');
});
```

The behavior itself (throwing `NotFoundException`) is really a unit-testable business rule — see [Unit Tests](./unit) — but re-confirming it once at the integration layer, resolved through the real container, is cheap insurance that nothing about the wiring (a wrong token, a missing provider) changes the outcome.

## Best Practices

### 1. Override at the edges, not the middle

Prefer overriding a repository or an external client over overriding a service in the middle of your call chain — the whole value of an integration test is proving that the *real* services wire together; overriding one defeats that.

### 2. One module definition per test file (or per `describe` block)

Keep the `providers`/`controllers` list close to what's actually under test. A giant shared testing module across every integration test makes failures hard to localize.

### 3. Compile once per test, not once per suite

`.compile()` is cheap (no real network, no real database), and a fresh module per `it()` avoids state leaking between tests through singleton providers.

### 4. Use `.get<T>()` for wiring checks, `HttpTestClient` for behavior checks

If you're asserting "does this resolve without throwing" or "did the container inject the right instance," `.get<T>()` is enough. If you're asserting on status codes, headers, or exact response shapes, reach for `HttpTestClient` (see [E2E Tests](./e2e)).

## Next Steps

- [E2E Tests](./e2e) — `HttpTestClient` in depth: full request/response flows
- [Unit Tests](./unit) — testing a single class without the container
- [Mocking](./mocking) — `createMock<T>()` and other faking patterns
