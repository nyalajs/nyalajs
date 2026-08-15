# @nyalajs/observability

## 1.1.0

### Minor Changes

- b7f965f: Automatic request-correlated logging and `@Optional()` dependency injection.

  - New `LogContext` (`@nyalajs/core`), an `AsyncLocalStorage`-based store mirroring `TenantContext`'s shape and lifecycle. `FastifyAdapter` populates it with `requestId`/`traceId` at the start of every request; `TenantMiddleware` and `AuthGuard` fill in `tenantId`/`userId` as they're learned.
  - `@nyalajs/observability`'s `Logger` now reads `LogContext` automatically on every `debug`/`info`/`warn`/`error` call — every log line for a request is correlated with zero extra code at the call site. Explicit `metadata` passed to a call still wins over `LogContext` on a field collision.
  - New `@Optional()` parameter decorator (`@nyalajs/core`): a constructor dependency marked `@Optional()` resolves to `undefined` instead of throwing "Provider not found" when nothing is registered for its token. Every other, non-`@Optional()` dependency still fails loudly if unwired — this only relaxes the one parameter it's applied to.

### Patch Changes

- Updated dependencies [b7f965f]
  - @nyalajs/core@2.1.0
  - @nyalajs/http@2.1.0
