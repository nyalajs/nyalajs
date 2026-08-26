# @nyalajs/storage

## 1.1.0

### Minor Changes

- Add WebSocket gateways, streaming (SSE/file/LLM-token-bridge), and Cloudflare R2 support.

  **`@nyalajs/http`**
  - `@WebSocketGateway()`/`@SubscribeMessage()`/`@BinaryMessage()`/`@OnConnect()`/`@OnDisconnect()`/`@MessageBody()`/`@ConnectedSocket()` — real-time bidirectional WebSocket gateways resolved through the same DI container as HTTP controllers, backed by `@fastify/websocket`. Opt-in via `websocket: true` on `FastifyAdapterOptions`. Includes room support (`socket.join()`/`.broadcast()`) and native binary frame handling (`@BinaryMessage()`, `socket.emitBinary()`), routed by `ws`'s own binary-frame flag, not JSON-in-base64.
  - `SseStream`/`StreamableResponse` — a handler can now return a streamed response (Server-Sent Events, or any raw `Readable`) instead of a plain object; the adapter pipes it and logs completion on actual stream end.
  - `asyncIterableToSse()` — bridges any `AsyncIterable<string>` (e.g. `@nyalajs/ai`'s `AiService.stream()`) onto an `SseStream`, for streaming an LLM reply to a browser token-by-token.
  - Fixed a Fastify bug where an `async` route handler that `await`s anything before `reply.send(readableStream)` silently truncated the response to its first chunk — every route now registers with a synchronous outer handler internally, with no change in behavior for non-streamed responses.
  - Added a README (previously missing despite being referenced in `package.json`).

  **`@nyalajs/storage`**
  - `StorageDisk.stream()`/`.putStream()` — streamed read/write on every disk (`LocalDisk`, `S3Disk`, now `R2Disk`), so large files are never fully buffered in memory. S3-compatible `putStream()` uses `@aws-sdk/lib-storage`'s multipart `Upload` (a raw `PutObjectCommand` can't accept a stream of unknown length).
  - `R2Disk` — Cloudflare R2 support, a thin config wrapper over `S3Disk`. Auto-builds the account-scoped endpoint and sets `region: "auto"` / `forcePathStyle: true`. `url()` requires an explicit `publicUrl` (R2 has no bucket-derivable public URL) and throws a clear, actionable error if omitted.
  - Added a README (previously missing despite being referenced in `package.json`).

  **`@nyalajs/core`**
  - `NyalaApplication.bindRoutes()` is now `async` (backward compatible — existing unawaited calls still work; `listen()` and `TestingModule` both now await it) and gained a duck-typed hook so an HTTP adapter can register WebSocket gateway routes at the right point in the boot sequence, without core knowing anything about WebSockets.
  - Added a README (previously missing despite being referenced in `package.json`).

  **`@nyalajs/testing`**
  - `TestingModuleBuilder.compile()` now awaits `app.bindRoutes()`, matching its new async signature.
  - Added a README (previously missing despite being referenced in `package.json`).

### Patch Changes

- Updated dependencies
  - @nyalajs/core@2.3.1
