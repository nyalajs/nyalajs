# @nyalajs/http

Fastify-backed HTTP layer for Nyala.js — routing, guards, interceptors, exception filters, WebSocket gateways, and streaming (SSE / file downloads), all resolved through the same DI container and module graph as the rest of the framework.

## Quick start

```ts
import "reflect-metadata";
import { NyalaFactory } from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);

  const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
    session: false,
  });
  app.setHttpAdapter(httpAdapter);

  await app.listen(3000);
}

bootstrap();
```

Controllers, routes, guards, and interceptors are declared with `@Controller()`/`@Get()`/`@UseGuards()`/`@UseInterceptors()` from `@nyalajs/core` — `@nyalajs/http` is the runtime that binds them to a real Fastify server.

## What's in this package

- **`FastifyAdapter`** — the HTTP runtime: request/response lifecycle, param resolution (`@Body`/`@Param`/`@Query`/`@Req`/`@Res`/...), guards, interceptors, `@Catch()`/`@UseFilters()` exception filters, form/multipart parsing, and security defaults (helmet, CORS, rate limiting, CSRF, compression — each independently toggleable via `FastifyAdapterOptions`).
- **WebSocket gateways** — `@WebSocketGateway()`/`@SubscribeMessage()`/`@BinaryMessage()`/`@OnConnect()`/`@OnDisconnect()` for real-time bidirectional connections, opt-in via `{ websocket: true }`. See the [WebSockets docs](https://github.com/nyalajs/nyalajs/blob/main/website/docs/features/websockets.md) for the full API.
- **Streaming** — `SseStream` for Server-Sent Events, `StreamableResponse` for raw file/body streaming, `asyncIterableToSse()` to bridge any `AsyncIterable<string>` (e.g. an LLM token stream) onto SSE. See the [Streaming docs](https://github.com/nyalajs/nyalajs/blob/main/website/docs/features/streaming.md).
- **`RenderableResponse`** — a duck-typed interface for pluggable response rendering (e.g. `@nyalajs/react`'s `view()`), so this package never needs to depend on a rendering library itself.

## Example: a controller with both HTTP and real-time

```ts
import { Controller, Get, Param } from "@nyalajs/core";
import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, NyalaSocket } from "@nyalajs/http";

@Controller("/rooms")
export class RoomsController {
  @Get("/:id")
  find(@Param("id") id: string) {
    return this.rooms.find(id);
  }
}

@WebSocketGateway({ path: "/ws/rooms" })
export class RoomsGateway {
  @SubscribeMessage("join")
  onJoin(@MessageBody() roomId: string, @ConnectedSocket() socket: NyalaSocket) {
    socket.join(roomId);
  }
}
```

Both resolve through the same DI container — a gateway can inject any service a controller can.

## Example: streaming a response

```ts
import { Controller, Get } from "@nyalajs/core";
import { SseStream } from "@nyalajs/http";

@Controller("/jobs")
export class JobsController {
  @Get("/:id/progress")
  track(@Param("id") id: string) {
    const sse = new SseStream();
    const job = this.jobs.watch(id);
    job.on("progress", (pct) => sse.send({ event: "progress", data: { pct } }));
    job.on("done", () => sse.close());
    return sse;
  }
}
```

## Peer dependencies

`fastify` and `reflect-metadata` are direct dependencies. WebSocket support (`@fastify/websocket`) is also a direct dependency, but its plugin is only registered on the Fastify instance when `websocket: true` is passed — no cost if you don't use it.

## Documentation

Full docs: [github.com/nyalajs/nyalajs](https://github.com/nyalajs/nyalajs#readme) — see especially [Controllers](https://github.com/nyalajs/nyalajs/blob/main/website/docs/building-blocks/controllers.md), [WebSockets](https://github.com/nyalajs/nyalajs/blob/main/website/docs/features/websockets.md), and [Streaming](https://github.com/nyalajs/nyalajs/blob/main/website/docs/features/streaming.md).
