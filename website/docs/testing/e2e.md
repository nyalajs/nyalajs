# End-to-End Tests

End-to-end (E2E) tests drive your application the way a real client would: an HTTP request in, a status code and JSON body out — except without an actual network socket. `@nyalajs/testing` provides `HttpTestClient` for this, wrapping Fastify's `.inject()` around a real `NyalaApplication`.

## `HttpTestClient`

```typescript
// packages/testing/src/http-test-client.ts
export class HttpTestClient {
  constructor(app: NyalaApplication) { /* ... */ }

  inject(options: InjectOptions | string): Promise<LightMyRequestResponse>;
  get(url: string, headers?: Record<string, string>);
  post(url: string, payload?: any, headers?: Record<string, string>);
  put(url: string, payload?: any, headers?: Record<string, string>);
  delete(url: string, headers?: Record<string, string>);
  patch(url: string, payload?: any, headers?: Record<string, string>);
}
```

It takes a `NyalaApplication` whose HTTP adapter has already been set up (`app.setHttpAdapter(...)`, which is what `TestingModule.compile()` does for you — see below), pulls out the underlying Fastify instance, and calls `.inject()` on it. Because `.inject()` runs the full Fastify request pipeline in-process — routing, hooks, your guards, your validation — a test against `HttpTestClient` exercises the same code path a real deployed request would, just without opening a port.

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { HttpTestClient } from '@nyalajs/testing';
```

## Getting an App to Test Against

`HttpTestClient` needs a `NyalaApplication` with routes already bound. The most direct way to get one in a test is `TestingModule`, covered in depth in [Integration Tests](./integration):

```typescript
import { TestingModule, HttpTestClient } from '@nyalajs/testing';

const moduleRef = await TestingModule.create({
  controllers: [WidgetsController],
}).compile();

const client = new HttpTestClient(moduleRef.createNyalaApplication());
```

`.compile()` calls `app.setHttpAdapter(new FastifyAdapter(...))` and `app.bindRoutes()` internally, so by the time you have a `TestingModule`, it's already ready for `HttpTestClient` to wrap. This is exactly the pattern used in `packages/testing/src/__tests__/testing-module.spec.ts`:

```typescript
describe('TestingModule route binding', () => {
  it('binds decorated controller routes so HttpTestClient can hit them', async () => {
    const moduleRef = await TestingModule.create({
      controllers: [WidgetsController],
    }).compile();

    const client = new HttpTestClient(moduleRef.createNyalaApplication());
    const res = await client.get('/widgets');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ widgets: ['a', 'b'] });
  });
});
```

## Making Requests

Each HTTP verb has a shorthand method, all backed by `.inject()`:

```typescript
await client.get('/users');
await client.get('/users/123', { authorization: 'Bearer <token>' });

await client.post('/users', { email: 'a@example.com', password: 'x' });
await client.post('/users', payload, { 'x-api-key': 'abc' });

await client.put('/users/123', { name: 'Updated Name' });
await client.patch('/users/123', { name: 'Partial Update' });

await client.delete('/users/123');
```

For anything the shorthands don't cover (custom methods, raw payload strings, explicit content types), call `.inject()` directly — it accepts Fastify's own `InjectOptions`:

```typescript
const res = await client.inject({
  method: 'POST',
  url: '/login',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  payload: 'email=admin%40example.com&password=hunter2',
});
```

## Inspecting Responses

The response is Fastify's `LightMyRequestResponse` — use `.statusCode`, `.json()`, `.body`, and `.headers` directly:

```typescript
const res = await client.get('/widgets');

expect(res.statusCode).toBe(200);
expect(res.json()).toEqual({ widgets: ['a', 'b'] });
expect(res.headers['content-type']).toContain('application/json');
```

## Example: An Auth Flow (Register → Login → Authenticated Request)

This mirrors the register/login/refresh flow documented with `curl` in [Authentication](../features/authentication), but driven through `HttpTestClient` against a compiled `TestingModule` instead of a live server:

```typescript
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestingModule, HttpTestClient } from '@nyalajs/testing';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { UsersRepository } from '../repositories/users.repository';
import { JwtService } from '@nyalajs/jwt';

describe('Auth flow (e2e)', () => {
  let client: HttpTestClient;

  beforeEach(async () => {
    // In-memory fake so this test doesn't need a real database.
    const users: any[] = [];
    const fakeUsersRepo = {
      findByEmail: async (email: string) => users.find((u) => u.email === email) ?? null,
      create: async (data: any) => {
        const user = { id: `u${users.length + 1}`, ...data };
        users.push(user);
        return user;
      },
    };

    const moduleRef = await TestingModule.create({
      controllers: [AuthController],
      providers: [AuthService, UsersRepository, JwtService],
    })
      .overrideProvider(UsersRepository, fakeUsersRepo)
      .compile();

    client = new HttpTestClient(moduleRef.createNyalaApplication());
  });

  it('registers a new user', async () => {
    const res = await client.post('/auth/register', {
      email: 'user@example.com',
      password: 'SecurePass123!',
      name: 'John Doe',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe('user@example.com');
    expect(body.user).not.toHaveProperty('password');
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
  });

  it('rejects registration with an email that is already taken', async () => {
    await client.post('/auth/register', {
      email: 'dup@example.com',
      password: 'SecurePass123!',
      name: 'First',
    });

    const res = await client.post('/auth/register', {
      email: 'dup@example.com',
      password: 'AnotherPass456!',
      name: 'Second',
    });

    expect(res.statusCode).toBe(409);
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    await client.post('/auth/register', {
      email: 'login@example.com',
      password: 'SecurePass123!',
      name: 'Login User',
    });

    const good = await client.post('/auth/login', {
      email: 'login@example.com',
      password: 'SecurePass123!',
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().accessToken).toBeDefined();

    const bad = await client.post('/auth/login', {
      email: 'login@example.com',
      password: 'wrong-password',
    });
    expect(bad.statusCode).toBe(401);
  });
});
```

Each `it()` gets a fresh `TestingModule` (via `beforeEach`) with its own in-memory `users` array, so tests don't leak state into each other — the same isolation concern noted in [Integration Tests](./integration).

## Testing Protected Routes

For a route behind `@UseGuards(AuthGuard)`, exercise both the unauthenticated and authenticated paths:

```typescript
it('rejects a request with no token', async () => {
  const res = await client.get('/users/profile');
  expect(res.statusCode).toBe(401);
});

it('returns the profile for a valid token', async () => {
  const login = await client.post('/auth/login', {
    email: 'login@example.com',
    password: 'SecurePass123!',
  });
  const { accessToken } = login.json();

  const res = await client.get('/users/profile', {
    authorization: `Bearer ${accessToken}`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().email).toBe('login@example.com');
});
```

## Testing Validation and Error Responses

Since `.inject()` runs the real pipeline, `@UseValidation()` decorators and thrown `HttpException`s behave exactly as they would in production:

```typescript
it('returns 400 for an invalid registration payload', async () => {
  const res = await client.post('/auth/register', {
    email: 'not-an-email',
    password: '123', // too short
  });

  expect(res.statusCode).toBe(400);
  expect(res.json().message).toBeDefined();
});

it('returns 404 for a resource that does not exist', async () => {
  const res = await client.get('/users/does-not-exist');
  expect(res.statusCode).toBe(404);
});
```

## Example: A Full CRUD Flow

For a resource-oriented controller, a single E2E test can walk through the whole lifecycle — create, read, update, delete — against one compiled module, similar in spirit to the register/login flow above:

```typescript
import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestingModule, HttpTestClient } from '@nyalajs/testing';
import { ProductsController } from '../controllers/products.controller';
import { ProductsService } from '../services/products.service';
import { ProductsRepository } from '../repositories/products.repository';

describe('Products CRUD (e2e)', () => {
  let client: HttpTestClient;

  beforeEach(async () => {
    const products: any[] = [];
    const fakeProductsRepo = {
      findAll: async () => products,
      findById: async (id: string) => products.find((p) => p.id === id) ?? null,
      create: async (data: any) => {
        const product = { id: `p${products.length + 1}`, ...data };
        products.push(product);
        return product;
      },
      update: async (id: string, data: any) => {
        const product = products.find((p) => p.id === id);
        if (!product) return null;
        Object.assign(product, data);
        return product;
      },
      delete: async (id: string) => {
        const index = products.findIndex((p) => p.id === id);
        if (index < 0) return false;
        products.splice(index, 1);
        return true;
      },
    };

    const moduleRef = await TestingModule.create({
      controllers: [ProductsController],
      providers: [ProductsService, ProductsRepository],
    })
      .overrideProvider(ProductsRepository, fakeProductsRepo)
      .compile();

    client = new HttpTestClient(moduleRef.createNyalaApplication());
  });

  it('creates, reads, updates, and deletes a product', async () => {
    const create = await client.post('/products', { name: 'Widget', price: 9.99 });
    expect(create.statusCode).toBe(200);
    const { id } = create.json();

    const read = await client.get(`/products/${id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().name).toBe('Widget');

    const update = await client.put(`/products/${id}`, { name: 'Widget v2', price: 12.99 });
    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe('Widget v2');

    const del = await client.delete(`/products/${id}`);
    expect(del.statusCode).toBe(200);

    const afterDelete = await client.get(`/products/${id}`);
    expect(afterDelete.statusCode).toBe(404);
  });
});
```

This exercises the controller's routing, the service's orchestration, and the fake repository's state — the same three concerns an [Integration Test](./integration) checks, but here verified through the actual HTTP surface a client would call.

## Testing Response Headers and Content Types

`HttpTestClient` responses expose the raw headers Fastify would have sent, which matters for anything relying on `@Header()`, redirects, or content negotiation (see [Controllers](../building-blocks/controllers)):

```typescript
it('sets a custom cache header on the index route', async () => {
  const res = await client.get('/products');
  expect(res.headers['cache-control']).toBe('max-age=3600');
});

it('redirects a legacy route to its new location', async () => {
  const res = await client.get('/old/products');
  expect(res.statusCode).toBe(301);
  expect(res.headers.location).toBe('/products');
});
```

## Best Practices

### 1. Prefer `HttpTestClient` for anything client-visible

Status codes, response headers, JSON shape, cookies — anything an actual API consumer would depend on belongs in an E2E test, because it's the layer closest to what they'll actually see.

### 2. Keep external services faked

`HttpTestClient` exercises your app's own pipeline for real, but that doesn't mean it should hit a real payment gateway or a real email provider — override those providers the same way described in [Integration Tests](./integration), before compiling.

### 3. Cover the unhappy paths, not just 200s

A register/login flow is only actually verified once you've also checked the duplicate-email 409, the wrong-password 401, and the invalid-payload 400 — see the examples above.

### 4. Don't overuse E2E for logic you already unit-tested

If `UsersService.create()`'s business rules are already covered by a unit test (see [Unit Tests](./unit)), an E2E test for the same route only needs to prove the HTTP wiring around it — status code, response shape — not re-derive every business rule again.

## Next Steps

- [Integration Tests](./integration) — building the `TestingModule` an E2E test runs against
- [Unit Tests](./unit) — testing business logic without HTTP at all
- [Mocking](./mocking) — faking the providers an E2E test overrides
