# Mocking

Nyala doesn't ship a mocking framework of its own — it leans on Vitest's `vi.fn()`/`vi.mock()` and one small typed helper, `createMock<T>()`, from `@nyalajs/testing`. This page walks through the patterns the framework's own test suite actually uses, so you can apply the same ones in your app.

## `createMock<T>()`

The entire implementation is three lines:

```typescript
// packages/testing/src/index.ts
export function createMock<T>(partial: Partial<T> = {}): T {
  return partial as T;
}
```

It doesn't create spies, doesn't proxy method calls, and doesn't validate that you've implemented every member of `T`. All it does is let TypeScript check the shape of the *properties you do provide* against the real type — so a fake with a misspelled method name or a mismatched signature fails to compile instead of failing at runtime three tests later.

```typescript
import { createMock } from '@nyalajs/testing';
import { UsersRepository } from '../repositories/users.repository';

const usersRepo = createMock<UsersRepository>({
  findByEmail: async (email) => (email === 'exists@example.com' ? { id: 'u1', email } : null),
});
```

Because it's just a cast, `createMock<T>()` works identically with Vitest, Jest, or no test runner at all — the doc comment in the source is explicit about that. What actually gives you assertions (`toHaveBeenCalledWith`, call counts, return-value control) is combining it with `vi.fn()`:

```typescript
import { vi } from 'vitest';
import { createMock } from '@nyalajs/testing';

const emailService = createMock<EmailService>({
  sendWelcome: vi.fn().mockResolvedValue(undefined),
});

// later
expect(emailService.sendWelcome).toHaveBeenCalledWith('user@example.com');
expect(emailService.sendWelcome).toHaveBeenCalledTimes(1);
```

Use `createMock<T>()` whenever you're building a fake for a class-shaped dependency (a repository, a service, a client) that you'll pass into a constructor — see [Unit Tests](./unit) for the full pattern in context.

## Untyped Fakes with `as any`

Not every fake needs to go through `createMock<T>()`. When a dependency's real interface is complex (or generic-heavy) and you only need to satisfy a constructor's type checker, a plain object cast with `as any` is common in the codebase too — see `packages/http/src/__tests__/fastify-adapter.spec.ts`:

```typescript
function mockContainer() {
  return {
    createRequestScope: vi.fn(),
    resolve: vi.fn(),
  } as any;
}

const adapter = new FastifyAdapter(mockContainer(), { session: false });
```

This is a judgment call: reach for `createMock<T>()` when you want the type safety and the dependency's real type is straightforward to reference; reach for a hand-typed object literal (with or without `as any`) when the fake needs to encode more specific per-test behavior (e.g. `resolve` returning different instances depending on the token, as in the example below).

## Faking Container Resolution

Several of the adapter's own tests build a fake container whose `resolve()` returns a specific controller instance for a specific token — this lets a test register a route and drive it through Fastify's real `.inject()` without a real DI container:

```typescript
class LoginController {
  login(body: any) {
    return { received: body };
  }
}

const controllerInstance = new LoginController();
const requestContainer = {
  register: vi.fn(),
  resolve: (token: any) => (token === LoginController ? controllerInstance : undefined),
};
const container = {
  createRequestScope: () => requestContainer,
  resolve: vi.fn(),
} as any;

const adapter = new FastifyAdapter(container, { session: false, csrf: false });
adapter.registerResolvedRoutes([
  { method: 'POST', path: '/login', controller: LoginController, handlerName: 'login', guards: [], interceptors: [] },
]);
```

This is a deliberately narrow fake — it doesn't reimplement a real DI container, it just answers the one question (`resolve(LoginController)`) the code under test actually asks. That's a useful default: fake exactly the surface the code exercises, not the whole real object's API.

## Faking `ExecutionContext` for Guards

Guards read a small, specific slice of `ExecutionContext` (`route.controller`, `route.handlerName`, `context.metadata`, sometimes `container.resolve`). Rather than mock the whole HTTP request/response cycle, the framework's guard tests build exactly that shape by hand — from `packages/security/src/__tests__/authorization.spec.ts`:

```typescript
function ctxFor(controller: any, handlerName: string, user?: any): any {
  return {
    route: { controller, handlerName, method: 'GET' },
    context: { metadata: new Map(user ? [['user', user]] : []) },
    request: {},
    container: { resolve: (Cls: any) => new Cls() },
  };
}

const guard = new RolesGuard();
const ctx = ctxFor(AdminController, 'deleteEverything', { roles: ['editor'] });
await expect(guard.canActivate(ctx)).rejects.toThrow(/does not have required roles/);
```

For a guard whose policy needs request arguments (like `PolicyGuard` checking ownership of a resource passed as a controller argument), extend the fake with just that field:

```typescript
const ctx = ctxFor(PostsController, 'update', { userId: 'user-1' });
ctx.request.args = [{ authorId: 'someone-else' }];

await expect(guard.canActivate(ctx)).rejects.toThrow(/Policy denied access/);
```

## Stateful Fakes Instead of Mocks

Sometimes what you need isn't a mock with pre-programmed return values, but a small object that behaves like real storage across several calls in one test. `templates/cms-starter/tests/smoke.spec.tsx` uses this for an in-memory "repository":

```typescript
function fakeCategoryRepository() {
  const rows: any[] = [];
  return {
    rows,
    findAll: async () => rows,
    findById: async (id: string) => rows.find((r) => r.id === id) ?? null,
    create: async (data: any) => {
      const row = { id: `id-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    },
    delete: async (id: string) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}
```

This isn't a "mock" in the spy sense — nothing here asserts on call counts. It's a fake with real (if tiny) behavior, which is the right tool when a test needs to create something and then verify it can be found, updated, or deleted afterward, without a real database.

Prefer this over a `vi.fn()`-based mock when a single test needs a dependency to remember state across multiple calls; prefer `createMock<T>()` + `vi.fn()` when you only care about individual call arguments and return values.

## Overriding Providers vs. Faking Constructor Arguments

Both are "mocking," but at different layers:

- **`createMock<T>()` / hand-rolled fakes** replace what you pass directly into a constructor — appropriate for unit tests (see [Unit Tests](./unit)).
- **`TestingModule#overrideProvider(token, useValue)`** replaces what the *DI container* hands to a real provider's constructor — appropriate for integration and E2E tests (see [Integration Tests](./integration)), because the class under test is resolved by the container rather than constructed by hand.

```typescript
// Unit test: you build the fake and pass it yourself
const service = new UsersService(createMock<UsersRepository>({ findById: vi.fn() }));

// Integration test: the container builds UsersService and injects the override for you
const moduleRef = await TestingModule.create({ providers: [UsersService, UsersRepository] })
  .overrideProvider(UsersRepository, createMock<UsersRepository>({ findById: vi.fn() }))
  .compile();
```

Note that `overrideProvider`'s second argument is the same kind of value `createMock<T>()` produces — the two combine naturally.

## Mocking Environment Variables

Some behavior (like the Fastify adapter's session secret validation) is driven by `process.env`. The pattern used in `packages/http/src/__tests__/fastify-adapter.spec.ts` snapshots and restores the relevant variables around each test, rather than mocking `process.env` wholesale:

```typescript
import { describe, it, expect, afterEach } from 'vitest';

describe('session secret/salt', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalSalt = process.env.SESSION_SALT;

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.SESSION_SALT = originalSalt;
  });

  it('throws instead of defaulting when SESSION_SECRET is unset', () => {
    delete process.env.SESSION_SECRET;
    delete process.env.SESSION_SALT;

    expect(() => new FastifyAdapter(mockContainer())).toThrow(/SESSION_SECRET/);
  });

  it('succeeds when both SESSION_SECRET and SESSION_SALT are valid', () => {
    process.env.SESSION_SECRET = 'a'.repeat(32);
    process.env.SESSION_SALT = '1234567890123456';

    expect(() => new FastifyAdapter(mockContainer())).not.toThrow();
  });
});
```

The `afterEach` restore matters — without it, mutating `process.env` in one test can silently change behavior in every test that runs after it in the same file.

## Spy Assertions Cheat Sheet

The assertions used throughout the examples above, all standard Vitest:

```typescript
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith('exact', 'args');
expect(fn).toHaveBeenLastCalledWith('most-recent-args');
expect(fn).not.toHaveBeenCalled();

vi.fn().mockResolvedValue(value);   // async success
vi.fn().mockRejectedValue(error);   // async failure
vi.fn().mockReturnValue(value);     // sync
vi.fn().mockImplementation((arg) => /* ... */);
```

## Choosing Between the Patterns

Putting the patterns above side by side:

| Pattern | Good for | Example source |
|---|---|---|
| `createMock<T>()` + `vi.fn()` | Typed fakes for a constructor dependency, with call assertions | `packages/testing/src/index.ts` |
| Untyped object + `as any` | Quick fakes where the real type is awkward to reference | `packages/http/src/__tests__/fastify-adapter.spec.ts` (`mockContainer()`) |
| Hand-built context object | Faking a framework-internal shape (`ExecutionContext`) that guards read a few fields from | `packages/security/src/__tests__/authorization.spec.ts` (`ctxFor()`) |
| Stateful in-memory fake | A dependency that needs to behave like storage across multiple calls in one test | `templates/cms-starter/tests/smoke.spec.tsx` (`fakeCategoryRepository()`) |
| `TestingModule#overrideProvider()` | Replacing a provider the DI container itself resolves, for integration/E2E tests | `packages/testing/src/testing-module.ts` |

None of these are mutually exclusive within a single test file — it's common to use a stateful fake for the repository and a `createMock<T>()` + `vi.fn()` for a side-effecting collaborator like an email service, in the same test.

## What This Codebase Doesn't Use

Worth calling out explicitly: nowhere in this repository's own test suite does a spec file reach for `vi.mock()` (module-level auto-mocking) or `vi.spyOn()`. Every mock is built by hand — either a typed `createMock<T>()` object, a plain object literal, or a small stateful fake — and passed explicitly into whatever constructor or function needs it. Vitest's `vi.mock()`/`vi.spyOn()` APIs still work fine in a Nyala project if you prefer them, but they're not the pattern this framework's own tests, or its testing utilities, are built around. If you're deciding which style to adopt for your app, following the explicit-construction style shown throughout this page will keep your tests consistent with the rest of the ecosystem.

## Best Practices

### 1. Fake the surface the code actually uses

Every real example above — `mockContainer()`, `ctxFor()`, `fakeCategoryRepository()` — implements only the handful of methods/fields the code under test touches, not a full reimplementation of the real class.

### 2. Type your fakes when you reasonably can

`createMock<T>()` costs nothing and catches typos in fake method names at compile time. Reach for untyped `as any` fakes when the real type is awkward to reference, not as a default.

### 3. Restore anything global you mutate

`process.env`, module-level singletons, or anything else shared across tests needs an `afterEach` (or `beforeEach` reset) — see the session secret example above.

### 4. Prefer a stateful fake over a long chain of `mockResolvedValueOnce`

If a test calls the same mocked method three times expecting three different results, consider whether a small stateful fake (like `fakeCategoryRepository`) would be more readable than three chained `.mockResolvedValueOnce(...)` calls.

## Next Steps

- [Unit Tests](./unit) — using `createMock<T>()` to isolate a class under test
- [Integration Tests](./integration) — using `overrideProvider()` to fake a provider inside the DI container
- [E2E Tests](./e2e) — faking providers before driving real HTTP requests through them
