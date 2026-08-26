# @nyalajs/core

The foundation of Nyala.js — dependency injection, module system, decorators, and application lifecycle. Every other `@nyalajs/*` package builds on this one; it has no dependencies of its own beyond `reflect-metadata`.

## Quick start

```ts
import "reflect-metadata";
import { Module, Controller, Get, Injectable, NyalaFactory } from "@nyalajs/core";

@Injectable()
class GreeterService {
  greet(name: string) {
    return `Hello, ${name}`;
  }
}

@Controller("/hello")
class HelloController {
  constructor(private greeter: GreeterService) {}

  @Get("/:name")
  hello(@Param("name") name: string) {
    return { message: this.greeter.greet(name) };
  }
}

@Module({ providers: [GreeterService], controllers: [HelloController] })
class AppModule {}

const app = await NyalaFactory.create(AppModule);
// attach an HTTP adapter (see @nyalajs/http) and app.listen(3000)
```

## What's in this package

- **Modules** — `@Module({ imports, providers, controllers, exports })`. The module loader builds a dependency graph, detects circular imports, and validates that anything a module exports is actually provided by it.
- **Dependency injection** — constructor injection via `@Injectable()`/`@Inject(token)`; singleton, request, and transient scopes; a request-scoped child container is created per HTTP request.
- **Controllers & routing metadata** — `@Controller()`, `@Get()`/`@Post()`/`@Put()`/`@Delete()`/`@Patch()`, `@Body()`/`@Param()`/`@Query()`/`@Req()`/`@Res()`/`@Headers()`/`@Cookie()` and more — the decorators; `@nyalajs/http`'s `FastifyAdapter` does the actual binding to a real server.
- **Cross-cutting concerns** — `@UseGuards()`, `@UseInterceptors()`, `@Catch()`/`@UseFilters()` for exception filters.
- **Lifecycle hooks** — `OnModuleInit`, `OnApplicationBootstrap`, `OnApplicationShutdown`.
- **`NyalaApplication`/`NyalaFactory`** — application bootstrap, plugin registration (`app.plugin(...)`), global middleware (`app.use(...)`).
- **Context** — `TenantContext`/`LogContext`, `AsyncLocalStorage`-backed request-scoped state readable from anywhere in the call chain, including code with no access to the request object.

## Runtime, not just types

This package is a real dependency-injection runtime, not a types-only decorator library — resolving a provider actually walks a dependency graph, instantiates classes with their constructor dependencies injected, and caches according to scope. See `@nyalajs/testing`'s `TestingModule` for exercising it in tests without spinning up a real HTTP server.

## Documentation

Full docs: [github.com/nyalajs/nyalajs](https://github.com/nyalajs/nyalajs/blob/main/website/docs/concepts/dependency-injection.md).
