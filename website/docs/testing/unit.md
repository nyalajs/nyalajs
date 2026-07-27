# Unit Tests

Unit tests exercise a single class in isolation — no DI container, no HTTP, no database. Because Nyala services and guards rely on plain constructor injection rather than any container magic, you can simply `new` up the class under test and hand it fakes for its dependencies.

## No Container Required

A Nyala service is just a class:

```typescript
import { Injectable } from '@nyalajs/core';
import { UsersRepository } from '../repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(private usersRepo: UsersRepository) {}

  async findById(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
```

`@Injectable()` only matters once this class is registered with a real DI container (see [Integration Tests](./integration)). For a unit test, you skip the container entirely and construct it directly:

```typescript
import { describe, it, expect } from 'vitest';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  it('throws when the user does not exist', async () => {
    const usersRepo = { findById: async () => null };
    const service = new UsersService(usersRepo as any);

    await expect(service.findById('missing-id')).rejects.toThrow('User not found');
  });
});
```

This is the pattern the framework's own test suite uses throughout — see `packages/database/src/__tests__/transaction.spec.ts`, which tests transaction wiring against a hand-built fake `db` object rather than a real Postgres connection.

## `createMock<T>()`

Casting a plain object literal to a dependency's type (`as any`, as above) works, but loses type-checking on the fake itself — a typo in a method name won't be caught. `@nyalajs/testing` exports a tiny helper for this:

```typescript
// packages/testing/src/index.ts
export function createMock<T>(partial: Partial<T> = {}): T {
  return partial as T;
}
```

It doesn't generate anything or wrap your methods — it just types a `Partial<T>` object as `T`, so TypeScript checks that the properties you *do* provide actually exist on the real type, with the right signatures. Anything you don't provide is simply absent at runtime — only call the methods you've stubbed.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMock } from '@nyalajs/testing';
import { UsersService } from '../users.service';
import { UsersRepository } from '../repositories/users.repository';
import { EmailService } from '../email.service';
import { HashService } from '../hash.service';

describe('UsersService.create', () => {
  it('hashes the password, persists the user, and sends a welcome email', async () => {
    const usersRepo = createMock<UsersRepository>({
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'new@example.com',
        password: 'hashed-value',
      }),
    });
    const hashService = createMock<HashService>({
      hash: vi.fn().mockResolvedValue('hashed-value'),
    });
    const emailService = createMock<EmailService>({
      sendWelcome: vi.fn().mockResolvedValue(undefined),
    });

    const service = new UsersService(usersRepo, emailService, hashService);

    const result = await service.create({
      email: 'new@example.com',
      password: 'plain-text',
    } as any);

    expect(usersRepo.findByEmail).toHaveBeenCalledWith('new@example.com');
    expect(hashService.hash).toHaveBeenCalledWith('plain-text');
    expect(usersRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'hashed-value' })
    );
    expect(emailService.sendWelcome).toHaveBeenCalledWith('new@example.com');
    expect(result).not.toHaveProperty('password');
  });
});
```

Each fake here combines `createMock<T>()` (for the type) with `vi.fn()` (for the actual stub behavior and call assertions) — that pairing is the idiomatic way to build unit-test doubles in Nyala.

## Testing Business Rules and Error Paths

Because services hold the framework's business logic (see [Services](../building-blocks/services)), most of what's worth unit-testing is branching behavior: what happens when a precondition fails.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMock } from '@nyalajs/testing';
import { UsersService } from '../users.service';

describe('UsersService.create — business rules', () => {
  it('rejects a duplicate email before touching the hash or repo create call', async () => {
    const usersRepo = createMock<UsersRepository>({
      findByEmail: vi.fn().mockResolvedValue({ id: 'existing', email: 'taken@example.com' }),
      create: vi.fn(),
    });
    const hashService = createMock<HashService>({ hash: vi.fn() });
    const emailService = createMock<EmailService>({ sendWelcome: vi.fn() });

    const service = new UsersService(usersRepo, emailService, hashService);

    await expect(
      service.create({ email: 'taken@example.com', password: 'x' } as any)
    ).rejects.toThrow('Email already exists');

    expect(hashService.hash).not.toHaveBeenCalled();
    expect(usersRepo.create).not.toHaveBeenCalled();
  });
});
```

Asserting on what *didn't* get called (`hashService.hash` never ran) is just as valuable as asserting on the happy path — it proves the guard clause short-circuited before any side effect.

## Unit-Testing Guards

Guards are also plain classes (they implement `canActivate(context)`), so they unit-test the same way — build a minimal fake `ExecutionContext` by hand. This is exactly how the framework tests its own guards, in `packages/security/src/__tests__/authorization.spec.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

function ctxFor(controller: any, handlerName: string, user?: any): any {
  return {
    route: { controller, handlerName, method: 'GET' },
    context: { metadata: new Map(user ? [['user', user]] : []) },
    request: {},
    container: { resolve: (Cls: any) => new Cls() },
  };
}

describe('RolesGuard', () => {
  class AdminController {
    @Roles('admin')
    deleteEverything() {}
  }

  it('denies a user without the required role', async () => {
    const guard = new RolesGuard();
    const ctx = ctxFor(AdminController, 'deleteEverything', { roles: ['editor'] });

    await expect(guard.canActivate(ctx)).rejects.toThrow(/does not have required roles/);
  });

  it('allows a user with the required role', async () => {
    const guard = new RolesGuard();
    const ctx = ctxFor(AdminController, 'deleteEverything', { roles: ['admin'] });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
```

No `TestingModule`, no HTTP server — the guard only needs the shape of `ExecutionContext` it actually reads (`route.controller`, `route.handlerName`, `context.metadata`), so the fake only needs to provide that shape. See [Mocking](./mocking) for more on this pattern.

## Stateful Fakes vs. `createMock<T>()`

`createMock<T>()` is best for dependencies where you only care about a couple of specific calls. When a test needs a dependency to actually *behave* like a small in-memory store across several calls, a hand-rolled fake is often clearer than stubbing every method individually. This pattern comes directly from `templates/cms-starter/tests/smoke.spec.tsx`:

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
    update: async (id: string, data: any) => {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, data);
      return row ?? null;
    },
    delete: async (id: string) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return index >= 0;
    },
  };
}

describe('CategoriesController (CRUD against a fake repository)', () => {
  it('creates, lists, updates, and deletes a category end to end', async () => {
    const repo = fakeCategoryRepository();
    const controller = new CategoriesController(repo as any);

    await controller.create({ name: 'News', slug: 'news' } as any, fakeReply());
    expect(repo.rows).toHaveLength(1);

    await controller.update(repo.rows[0].id, { name: 'Updates', slug: 'updates' } as any, fakeReply());
    expect(repo.rows[0].name).toBe('Updates');

    await controller.delete(repo.rows[0].id, fakeReply());
    expect(repo.rows).toHaveLength(0);
  });
});
```

Notice this test constructs `CategoriesController` directly with `new`, exactly like a service test — controllers are plain classes too, so they're just as unit-testable when you don't need real routing or guards in the picture. See [Controllers](../building-blocks/controllers).

## Testing a Policy Class

Policies (used with `@UsePolicy()`, see [Authorization](../features/authorization)) are also plain classes with a synchronous or async method per action, so they unit-test the same way as guards — construct directly and call the method:

```typescript
import { describe, it, expect } from 'vitest';

class PostPolicy {
  update(user: any, resource: any): boolean {
    return resource?.authorId === user?.userId;
  }
}

describe('PostPolicy', () => {
  it('allows the author to update their own post', () => {
    const policy = new PostPolicy();
    const result = policy.update({ userId: 'user-1' }, { authorId: 'user-1' });
    expect(result).toBe(true);
  });

  it('denies a user updating someone else\'s post', () => {
    const policy = new PostPolicy();
    const result = policy.update({ userId: 'user-1' }, { authorId: 'someone-else' });
    expect(result).toBe(false);
  });
});
```

This is the same shape the framework's own `PolicyGuard` test suite drives through `guard.canActivate(ctx)` (see `packages/security/src/__tests__/authorization.spec.ts`) — but when you only care about the policy's own decision logic, and not how a guard invokes it, testing the policy class directly is simpler and faster.

## Organizing Unit Test Files

Following the `basic-starter` template's script convention (`test:unit` → `vitest run tests/unit`), a typical layout mirrors your `app/` directory one-to-one:

```
app/
├── services/
│   ├── users.service.ts
│   └── orders.service.ts
└── guards/
    └── roles.guard.ts

tests/
└── unit/
    ├── services/
    │   ├── users.service.spec.ts
    │   └── orders.service.spec.ts
    └── guards/
        └── roles.guard.spec.ts
```

Inside the framework's own packages, the convention is instead a single `__tests__` directory co-located next to `src`, with one spec file per unit under test (`packages/security/src/__tests__/authorization.spec.ts`, `packages/database/src/__tests__/transaction.spec.ts`). Either convention is fine — Vitest discovers `*.spec.ts` and `*.test.ts` files anywhere in the project by default.

## Testing Async Side Effects You Don't Await

Some services intentionally fire off background work without awaiting it (see the "Async Operations" pattern in [Services](../building-blocks/services)). Unit-test the synchronous part directly, and unit-test the background function separately by calling it as its own method:

```typescript
describe('ReportService.generateMonthlyReport', () => {
  it('returns immediately with a processing status', async () => {
    const ordersRepo = createMock<OrdersRepository>({ findByUser: vi.fn() });
    const emailService = createMock<EmailService>({ sendReportReady: vi.fn() });
    const service = new ReportService(ordersRepo, emailService);

    const result = await service.generateMonthlyReport('user-1');

    expect(result.status).toBe('processing');
    expect(result.reportId).toBeDefined();
  });
});
```

If the background method (`processReport` in that example) is worth testing on its own, and it's `private`, consider whether it should be extracted to its own small class or exported helper — private methods are usually better tested indirectly through the public method that calls them, or made public/extracted if they've grown complex enough to need direct coverage.

## Best Practices

### 1. Keep the fake as small as the dependency's usage

Only stub the methods the code under test actually calls. `createMock<T>({ findById: vi.fn() })` is fine even though `UsersRepository` has five methods — you don't need the other four for this test.

### 2. Assert on both outcome and interaction

```typescript
// ✅ Good — checks the result AND that the right calls happened
expect(result).toEqual(expectedUser);
expect(usersRepo.update).toHaveBeenCalledWith('u1', { password: 'new-hash' });

// ❌ Weaker — only checks the final value, missing whether a
// side-effecting call (like sending an email) happened at all
expect(result).toEqual(expectedUser);
```

### 3. Test one branch per `it()`

Each `it()` block should exercise a single business rule (one guard clause, one code path) so a failure immediately tells you which rule broke.

### 4. Don't reach for `TestingModule` here

If you find yourself wanting the DI container in a "unit" test, that's usually a sign you're actually writing an integration test — see [Integration Tests](./integration) for when that's the right call.

## Next Steps

- [Integration Tests](./integration) — testing real DI wiring with `TestingModule`
- [Mocking](./mocking) — a deeper look at `createMock<T>()` and other faking patterns
- [E2E Tests](./e2e) — driving real HTTP requests with `HttpTestClient`
