---
"@nyalajs/core": patch
---

Fix `@UseGuards()`/`@UseInterceptors()` being a silent no-op. `RouteResolver.resolveRoutes()` never read the metadata these decorators write, so every route's `guards`/`interceptors` were always empty regardless of what was declared — `FastifyAdapter` already had correct guard/interceptor execution logic, it just never received anything to execute. Affects every existing template that uses `@UseGuards()`, including `cms-starter`'s own `SessionAuthGuard` on `/admin` routes — those routes were reachable without authentication. `MetadataScanner` gained `getGuards()`/`getInterceptors()` (method-level overrides class-level, matching `@UseGuards()`'s own documented example), now wired into `RouteResolver`.
