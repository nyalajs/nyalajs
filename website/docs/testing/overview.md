# Testing

Nyala is built around plain TypeScript classes and constructor injection, which makes testing straightforward: services are just classes you can `new` up with fakes, controllers are just classes with methods, and the DI container is available on demand when you actually need it wired up. You don't need a running server to test most of your application.

## Philosophy

Nyala's testing story follows the same layering as the framework itself:

- **Services and guards are plain classes.** Give them fake dependencies in a constructor call and you have a unit test — no container, no HTTP, no framework bootstrap required.
- **The DI container is opt-in.** When you actually want to verify that your providers wire together correctly (a controller resolving its service, a service resolving its repository), `@nyalajs/testing` gives you a `TestingModule` that builds a real container from a `@Module()`-shaped definition.
- **HTTP is testable without a socket.** The framework's Fastify adapter supports Fastify's `.inject()`, so end-to-end tests can drive real routes, real guards, and real validation without binding to a port.

This gives you three natural layers, each covered by its own page:

| Layer | What's real | What's faked | Page |
|---|---|---|---|
| Unit | The class under test | Everything it depends on | [Unit Tests](./unit) |
| Integration | The DI container, several real providers | The edges of the graph (e.g. a repository) | [Integration Tests](./integration) |
| E2E | The whole app, routing, guards, validation | Usually nothing — maybe external services | [E2E Tests](./e2e) |

## Test Runner: Vitest

Every package in the Nyala monorepo, and every starter template, runs its tests with [Vitest](https://vitest.dev). You can see this directly in the package scripts:

```json
// packages/testing/package.json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

```json
// templates/basic-starter/package.json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

At the workspace root, `npm test` runs `turbo run test`, which fans out to every package's own `vitest run`:

```json
// package.json (root)
{
  "scripts": {
    "test": "turbo run test"
  }
}
```

A typical `vitest.config.ts` for a Nyala app looks like this (from `templates/saas-starter/vitest.config.ts`):

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.spec.ts', '**/*.test.ts', '**/test/**'],
    },
  },
});
```

With `globals: true`, `describe`, `it`, `expect`, and `vi` are available without importing them — though most of the framework's own test suite imports them explicitly from `vitest` for clarity:

```typescript
import { describe, it, expect, vi } from 'vitest';
```

## The Same Feature, Tested at Every Layer

To see how the three layers relate, here's one small feature — a `WidgetsService` with a `list()` method — tested at each layer. Each version answers a different question about the same code.

**Unit** — does `WidgetsService.list()` correctly delegate to its repository? No container, no HTTP:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMock } from '@nyalajs/testing';
import { WidgetsService } from '../widgets.service';

it('delegates to the repository', async () => {
  const repo = createMock<WidgetsRepository>({ findAll: vi.fn().mockResolvedValue(['a', 'b']) });
  const service = new WidgetsService(repo);

  expect(await service.list()).toEqual(['a', 'b']);
});
```

**Integration** — does `WidgetsService` actually get resolved with a real `WidgetsRepository` (or an override) by the DI container?

```typescript
import { TestingModule } from '@nyalajs/testing';

it('resolves through the real container', async () => {
  const moduleRef = await TestingModule.create({
    providers: [WidgetsService, WidgetsRepository],
  })
    .overrideProvider(WidgetsRepository, { findAll: async () => ['a', 'b'] })
    .compile();

  const service = moduleRef.get<WidgetsService>(WidgetsService);
  expect(await service.list()).toEqual(['a', 'b']);
});
```

**E2E** — does a client hitting `GET /widgets` actually get `{ widgets: ['a', 'b'] }` back, through real routing?

```typescript
import { TestingModule, HttpTestClient } from '@nyalajs/testing';

it('serves the list over HTTP', async () => {
  const moduleRef = await TestingModule.create({
    controllers: [WidgetsController],
    providers: [WidgetsService, WidgetsRepository],
  })
    .overrideProvider(WidgetsRepository, { findAll: async () => ['a', 'b'] })
    .compile();

  const client = new HttpTestClient(moduleRef.createNyalaApplication());
  const res = await client.get('/widgets');

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ widgets: ['a', 'b'] });
});
```

None of these three tests are redundant: the unit test is the fastest feedback loop for `WidgetsService`'s own logic, the integration test catches DI wiring mistakes the unit test can't see, and the E2E test is the only one that would catch a routing typo (`@Get('/widget')` instead of `@Get('/widgets')`) or a guard misconfiguration. Each subsequent page goes deep on one of these three.

## reflect-metadata

Nyala's decorators (`@Injectable()`, `@Controller()`, `@Module()`, and friends) rely on `reflect-metadata` for design-time type reflection. Any spec file that touches decorated classes needs to import it once, at the top, before anything else:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
```

If you're testing plain classes with no decorators involved (a pure unit test with hand-rolled fakes, for example), you can usually skip this — but it's harmless to include it everywhere, and most Nyala test files do.

## What `@nyalajs/testing` Gives You

The `@nyalajs/testing` package is small and deliberately unopinionated. It exports three things:

```typescript
import { TestingModule, HttpTestClient, createMock } from '@nyalajs/testing';
```

- **`TestingModule`** (and its builder, `TestingModuleBuilder`) — compiles a `@Module()`-shaped definition (`imports`, `providers`, `controllers`) into a real, running `NyalaApplication` with a real DI container, letting you override individual providers before compiling. See [Integration Tests](./integration).
- **`HttpTestClient`** — wraps Fastify's `.inject()` around a `NyalaApplication`, so you can send `GET`/`POST`/`PUT`/`PATCH`/`DELETE` requests into your app's actual routing pipeline without listening on a port. See [E2E Tests](./e2e).
- **`createMock<T>()`** — a one-line helper that types a partial object as `T`, for handing fake dependencies to a class constructor. See [Mocking](./mocking) and [Unit Tests](./unit).

Install it as a dev dependency alongside `vitest`:

```bash
npm install --save-dev @nyalajs/testing vitest
```

## Project Layout

The `basic-starter` template's scripts (`test:unit`, `test:integration`, `test:e2e`) imply a directory convention worth following in your own app:

```
tests/
├── unit/
│   └── users.service.spec.ts
├── integration/
│   └── users.module.spec.ts
└── e2e/
    └── auth.e2e.spec.ts
```

Inside the framework's own packages, tests are co-located instead, in a `__tests__` directory next to the code they cover (for example `packages/security/src/__tests__/authorization.spec.ts`). Either layout works with Vitest's default file discovery (`*.spec.ts`, `*.test.ts`) — pick whichever matches how the rest of your team organizes code.

## Choosing the Right Layer

A rough rule of thumb, consistent with how Nyala's own test suite is organized:

- **Default to unit tests.** They're the fastest to write and run, and most business logic (validation rules, calculations, branching) doesn't need a container or HTTP to verify.
- **Reach for integration tests** when the thing you're worried about is *wiring* — does this controller actually get the service it expects from the container, does an overridden provider actually take effect, does a guard registered on a module actually run.
- **Reserve E2E tests** for flows that only make sense end-to-end — an auth flow spanning register → login → an authenticated request, or verifying the exact HTTP status/JSON shape a client will see.

This mirrors how the framework's own monorepo is tested: the vast majority of `*.spec.ts` files across `packages/*/src/__tests__` are unit-style tests of a single class, `packages/testing/src/__tests__/testing-module.spec.ts` is the integration/E2E layer for the testing helpers themselves, and template-level smoke tests (`templates/cms-starter/tests/smoke.spec.tsx`) exercise controllers and guards together against fakes.

## Running Tests

Within a single package or app, the usual Vitest commands apply:

```bash
# Run once (CI mode)
npx vitest run

# Re-run on file changes
npx vitest

# Run a single file
npx vitest run tests/unit/users.service.spec.ts

# Filter by test name
npx vitest run -t "rejects a duplicate email"

# With coverage (if @vitest/coverage-v8 is installed — see basic-starter's devDependencies)
npx vitest run --coverage
```

From the workspace root, `npm test` (→ `turbo run test`) runs every package's `test` script, and Turborepo's `test` pipeline is configured to depend on `build` first:

```json
// turbo.json
{
  "pipeline": {
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

In practice this means `npm test` at the root always compiles first, so a test failure is a real test failure — not a stale `dist/` from a previous build.

## Common Pitfalls

**Forgetting `import 'reflect-metadata'`.** If a spec file uses any decorator (`@Injectable()`, `@Controller()`, `@Module()`, custom decorators like `@Roles()`), and it's the *first* file in the process to touch decorator metadata, omitting the import can produce confusing failures where metadata reads back as `undefined`. Put it as the very first import.

**Mutating shared fixtures between tests.** The in-memory fakes shown throughout these pages (`fakeCategoryRepository()`, the `users` array in an E2E `beforeEach`) are deliberately rebuilt per test — don't hoist a single mutable fake to module scope and reuse it across `it()` blocks, or state from one test will leak into the next.

**Testing through more layers than the failure needs.** If a bug is in a service's business rule, a unit test that constructs the service directly will pinpoint it far faster than an E2E test that has to fail all the way through routing and guards first.

## Next Steps

- [Unit Tests](./unit) — testing a service or guard in isolation with `createMock<T>()`
- [Integration Tests](./integration) — wiring real providers together with `TestingModule`
- [E2E Tests](./e2e) — driving real HTTP routes with `HttpTestClient`
- [Mocking](./mocking) — `createMock<T>()`, hand-rolled fakes, and spying with `vi.fn()`
