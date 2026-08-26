# WebSockets

`@nyalajs/http` provides a real-time gateway layer built on `@fastify/websocket` — `@WebSocketGateway()`/`@SubscribeMessage()` for bidirectional connections, resolved through the same DI container and module graph as HTTP controllers. A gateway can depend on any other provider (services, repositories, ...) exactly like a controller can.

## Quick Start

```typescript
import { Injectable, Module } from '@nyalajs/core';
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  NyalaSocket,
} from '@nyalajs/http';

@Injectable()
export class ChatService {
  formatMessage(from: string, text: string) {
    return { from, text, at: new Date().toISOString() };
  }
}

@WebSocketGateway({ path: '/ws/chat' })
export class ChatGateway {
  constructor(private chat: ChatService) {}

  @SubscribeMessage('message')
  onMessage(@MessageBody() body: { text: string }, @ConnectedSocket() socket: NyalaSocket) {
    socket.broadcast('general', 'message', this.chat.formatMessage(socket.id, body.text));
  }
}

@Module({ providers: [ChatService, ChatGateway] })
export class ChatModule {}
```

Enable WebSocket support on the adapter (off by default — the `@fastify/websocket` plugin isn't registered at all unless you opt in):

```typescript
// main.ts
const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
  websocket: true,
});
app.setHttpAdapter(httpAdapter);
await app.listen(3000);
```

A browser connects with a plain `WebSocket` and speaks small JSON frames:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/chat');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onopen = () => ws.send(JSON.stringify({ event: 'message', data: { text: 'hi!' } }));
```

## Wire Format

Every frame, in either direction, is `{"event": "<name>", "data": <payload>}` as one JSON text frame. `@SubscribeMessage(event)` routes an incoming frame to the matching handler by its `event` field; an event with no matching handler is silently ignored, the same way an unhandled DOM event is.

## Decorators

### `@WebSocketGateway(options?)`

Marks a class as a gateway — the real-time counterpart to `@Controller()`. Declared as an ordinary `provider` in a module, not something with its own module-metadata slot.

```typescript
interface WebSocketGatewayOptions {
  /** The URL path this gateway upgrades on. Defaults to "/ws". */
  path?: string;
}
```

Distinct gateways need distinct paths — each is its own upgrade endpoint, unlike Socket.IO namespaces multiplexed over one connection.

### `@SubscribeMessage(event)`

Marks a method as the handler for one event name.

```typescript
@SubscribeMessage('typing')
onTyping(@MessageBody() body: { userId: string }) { /* ... */ }
```

A handler can optionally return `{ event, data }` to reply directly to the sender — mirroring how an HTTP handler returns its response body instead of calling `res.send()`:

```typescript
@SubscribeMessage('ping')
onPing() {
  return { event: 'pong', data: null };
}
```

### `@OnConnect()` / `@OnDisconnect()`

Run once, right after a connection is accepted or closes (any reason):

```typescript
@WebSocketGateway({ path: '/ws/chat' })
export class ChatGateway {
  @OnConnect()
  onConnect(@ConnectedSocket() socket: NyalaSocket) {
    socket.join('general');
    socket.data.connectedAt = Date.now();
  }

  @OnDisconnect()
  onDisconnect(@ConnectedSocket() socket: NyalaSocket) {
    console.log(`${socket.id} disconnected after`, Date.now() - socket.data.connectedAt, 'ms');
  }
}
```

### `@MessageBody()` / `@ConnectedSocket()`

Parameter decorators — inject the deserialized frame payload, or the `NyalaSocket` for the connection that sent it. Order doesn't matter:

```typescript
@SubscribeMessage('message')
onMessage(@ConnectedSocket() socket: NyalaSocket, @MessageBody() body: { text: string }) { /* ... */ }
```

With no decorators at all, the raw payload is passed positionally as the only argument.

## `NyalaSocket`

The per-connection handle passed to gateway handlers — the real-time equivalent of `ExecutionContext`/`RequestContext` for HTTP.

```typescript
class NyalaSocket {
  readonly id: string;
  readonly data: Record<string, any>; // arbitrary per-connection state you attach in @OnConnect()

  emit(event: string, data?: any): void;
  emitBinary(event: string, payload: Buffer): void;

  join(room: string): void;
  leave(room: string): void;
  currentRooms(): string[];

  broadcast(room: string, event: string, data?: any): void;
  broadcastBinary(room: string, event: string, payload: Buffer): void;

  close(code?: number, reason?: string): void;
}
```

- **`emit(event, data)`** — sends one event to this connection only.
- **`broadcast(room, event, data)`** — sends to every *other* connection in `room` (not back to the sender).
- **`join(room)` / `leave(room)`** — room membership is tracked per gateway; a socket disconnecting automatically leaves every room it was in.
- **`data`** — a plain object for attaching whatever a handler needs later (authenticated `userId`, `tenantId`, ...), typically set in `@OnConnect()`.

## Binary Frames

For raw bytes — uploaded audio/video chunks, protobuf, anything that isn't JSON — use `@BinaryMessage()` instead of `@SubscribeMessage()`. It's routed by `ws`'s native binary-frame flag, not by sniffing the payload:

```typescript
import { BinaryMessage, MessageBody, ConnectedSocket, NyalaSocket } from '@nyalajs/http';

@WebSocketGateway({ path: '/ws/media' })
export class MediaGateway {
  @BinaryMessage('audio-chunk')
  onAudioChunk(@MessageBody() chunk: Buffer, @ConnectedSocket() socket: NyalaSocket) {
    this.transcriber.feed(chunk);
  }
}
```

A `@BinaryMessage()` handler can return a `Buffer` to reply with raw bytes under the same event name, or an `{ event, data }` object to reply with JSON instead. `@SubscribeMessage()` and `@BinaryMessage()` use separate metadata, so one gateway can freely mix JSON control messages and binary payloads — even under the same event name, as two distinct handlers — on the same connection.

## Rooms

Rooms are scoped per gateway — they don't cross gateways declared on different paths. A socket can belong to any number of rooms; a room is created implicitly on first `join()` and cleaned up automatically once empty.

```typescript
@WebSocketGateway({ path: '/ws/chat' })
export class ChatGateway {
  @SubscribeMessage('join-room')
  onJoinRoom(@MessageBody() room: string, @ConnectedSocket() socket: NyalaSocket) {
    socket.join(room);
  }

  @SubscribeMessage('room-message')
  onRoomMessage(
    @MessageBody() body: { room: string; text: string },
    @ConnectedSocket() socket: NyalaSocket
  ) {
    socket.broadcast(body.room, 'room-message', { from: socket.id, text: body.text });
  }
}
```

## Hybrid Apps and Testing

A gateway resolves through the exact same DI container and module graph as your HTTP controllers — declare it as a `provider` in the same module (or a different one, imported normally), and it works alongside your REST/Inertia routes in one process, one port.

For a full worked example with two connections broadcasting to each other, see [`examples/basic-app/src/chat/`](https://github.com/nyalajs/nyalajs/tree/main/examples/basic-app/src/chat) in the repo.

## Next Steps

- [Streaming](./streaming) - Server-Sent Events and file streaming
- [Services](../building-blocks/services) - Service layer patterns
