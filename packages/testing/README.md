# @nyalajs/testing

Testing utilities for Nyala.js — a `TestingModule` for compiling a real DI-wired module in tests (with provider overrides for mocking), and an `HttpTestClient` for exercising HTTP routes without binding to a real port.

## Quick start

```ts
import { TestingModuleBuilder } from "@nyalajs/testing";
import { Module } from "@nyalajs/core";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

describe("UsersController", () => {
  it("returns the user list", async () => {
    const testingModule = await new TestingModuleBuilder({
      controllers: [UsersController],
      providers: [UsersService],
    })
      .overrideProvider(UsersService, { findAll: async () => [{ id: "1", name: "Ada" }] })
      .compile();

    const usersService = testingModule.get(UsersService);
    expect(await usersService.findAll()).toEqual([{ id: "1", name: "Ada" }]);
  });
});
```

## `TestingModuleBuilder`

```ts
new TestingModuleBuilder({ imports?, providers?, controllers? })
  .overrideProvider(token, useValue) // swap a real provider for a mock, chainable
  .compile(): Promise<TestingModule>
```

`compile()` boots a real `NyalaApplication` (via `NyalaFactory.create()`) with a `FastifyAdapter` wired in and routes bound — the same DI container, module graph, and route resolution your app uses at runtime, just without listening on a port.

```ts
class TestingModule {
  get<T>(token: Type<T> | string | symbol): T; // resolve any provider/controller from the compiled container
}
```

## `HttpTestClient`

Wraps Fastify's `.inject()` — sends a real request through the whole middleware/guard/interceptor/handler pipeline without opening a socket:

```ts
import { HttpTestClient } from "@nyalajs/testing";

const client = new HttpTestClient(app); // app: NyalaApplication, from TestingModule or NyalaFactory.create()

const res = await client.get("/users");
expect(res.statusCode).toBe(200);
expect(res.json()).toEqual([{ id: "1", name: "Ada" }]);

await client.post("/users", { name: "Grace" });
```

`get`/`post`/`put`/`patch`/`delete` are shorthands over `inject(options)`, which accepts Fastify's own `InjectOptions` directly for anything more specific (custom headers, query strings, etc.).

## `createMock<T>()`

A small typed-partial helper for building mock objects without `as any` scattered through test files:

```ts
import { createMock } from "@nyalajs/testing";

const mockUsersService = createMock<UsersService>({
  findAll: async () => [],
});
```

## Documentation

Full docs: [github.com/nyalajs/nyalajs](https://github.com/nyalajs/nyalajs/blob/main/website/docs/testing/overview.md).
