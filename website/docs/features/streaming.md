# Streaming

`@nyalajs/http` supports streamed responses — Server-Sent Events for live/incremental updates, and raw stream piping for large files — without buffering the whole response body in memory before sending it.

## Server-Sent Events (SSE)

A handler returns an `SseStream` instead of a plain object. The adapter sets the right headers (`text/event-stream`, no-buffering directives for proxies) and pipes events as they're sent:

```typescript
import { Controller, Get } from '@nyalajs/core';
import { SseStream } from '@nyalajs/http';

@Controller('/jobs')
export class JobsController {
  @Get('/:id/progress')
  trackProgress(@Param('id') id: string) {
    const sse = new SseStream();
    const job = this.jobs.watch(id);

    job.on('progress', (pct) => sse.send({ event: 'progress', data: { pct } }));
    job.on('done', (result) => {
      sse.send({ event: 'done', data: result });
      sse.close();
    });

    return sse;
  }
}
```

A browser consumes it with `EventSource`:

```javascript
const es = new EventSource('/jobs/123/progress');
es.addEventListener('progress', (e) => updateBar(JSON.parse(e.data).pct));
es.addEventListener('done', (e) => { render(JSON.parse(e.data)); es.close(); });
```

### `SseStream` API

```typescript
class SseStream {
  constructor(options?: { heartbeatMs?: number });

  send(message: { event?: string; data: any; id?: string; retry?: number }): void;
  close(): void;
  isClosed(): boolean;
}
```

- **`send(message)`** — no-ops silently once the stream is closed (matches `EventSource` semantics: nothing left to reconnect to). `data` is JSON-stringified unless it's already a string; multi-line payloads get one `data:` line per line per the SSE spec.
- **`options.heartbeatMs`** — sends a comment line (`: heartbeat`) on this interval, invisible to `EventSource` but keeps intermediary proxies/load balancers from timing out an otherwise-idle connection.
- The connection is automatically detected as closed by the client and the source stream is cleaned up — a handler pushing into an abandoned `SseStream` doesn't leak.

## Streaming Files and Other Raw Bodies

For anything that isn't SSE-framed — file downloads, proxied responses — return a plain `StreamableResponse` wrapping any Node `Readable`:

```typescript
import { Controller, Get } from '@nyalajs/core';
import { StorageService, StreamableResponse } from '@nyalajs/http';

@Controller('/files')
export class FilesController {
  constructor(private storage: StorageService) {}

  @Get('/:id/download')
  async download(@Param('id') id: string): Promise<StreamableResponse> {
    return {
      stream: await this.storage.stream(`uploads/${id}`),
      contentType: 'application/octet-stream',
      headers: { 'Content-Disposition': `attachment; filename="${id}"` },
    };
  }
}
```

```typescript
interface StreamableResponse {
  stream: Readable;
  contentType?: string; // defaults to "application/octet-stream"
  statusCode?: number;  // defaults to 200
  headers?: Record<string, string>;
}
```

`SseStream` implements this interface too (it wraps a push-style `Readable` internally), so the adapter needs no SSE-specific branch — both go through the same streaming path.

## Streaming an LLM Reply

`@nyalajs/ai`'s `AiService.stream()` already yields tokens incrementally as an `AsyncIterable<string>`. `asyncIterableToSse()` bridges any such iterable straight onto an `SseStream` a handler can return:

```typescript
import { Controller, Post, Body } from '@nyalajs/core';
import { asyncIterableToSse } from '@nyalajs/http';
import { AiService } from '@nyalajs/ai';

@Controller('/chat')
export class ChatController {
  constructor(private ai: AiService) {}

  @Post('/stream')
  streamReply(@Body() body: { message: string }) {
    return asyncIterableToSse(
      this.ai.stream([{ role: 'user', content: body.message }])
    );
  }
}
```

```javascript
// Browser — POST + SSE needs a manual fetch reader, not EventSource
// (EventSource only supports GET requests).
const res = await fetch('/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'hello' }),
});
const reader = res.body.getReader();
// ...read and parse "event: chunk\ndata: ...\n\n" frames incrementally
```

### `asyncIterableToSse()` options

```typescript
function asyncIterableToSse(
  source: AsyncIterable<string>,
  options?: {
    event?: string;           // event name each chunk is sent under; defaults to "chunk"
    doneEvent?: string | null; // event sent on completion; defaults to "done", pass null to skip
    heartbeatMs?: number;
  }
): SseStream;
```

Each yielded value becomes one `chunk` event; a `done` event fires once the source completes; if the source throws mid-stream, an `error` event is sent (`{ message }`) before the stream closes.

## File Streaming in `@nyalajs/storage`

`StorageDisk` (implemented by `LocalDisk`, `S3Disk`, and `R2Disk`) has streaming counterparts to `get()`/`put()` that never buffer a whole file into memory:

```typescript
interface StorageDisk {
  get(path: string): Promise<Buffer>;        // fully buffered — fine for small files
  stream(path: string): Promise<Readable>;   // streamed read — use for anything large

  put(path: string, contents: string | Buffer): Promise<void>;
  putStream(path: string, contents: Readable): Promise<void>; // streamed write
}
```

```typescript
// Serve a large file without ever holding the whole thing in memory
@Get('/videos/:id')
async streamVideo(@Param('id') id: string): Promise<StreamableResponse> {
  return { stream: await this.storage.stream(`videos/${id}.mp4`), contentType: 'video/mp4' };
}

// Accept a large upload the same way — piped straight to disk/S3, not buffered first
async saveUpload(id: string, body: Readable) {
  await this.storage.putStream(`uploads/${id}`, body);
}
```

On S3-compatible disks (`S3Disk`, `R2Disk`), `putStream()` uses `@aws-sdk/lib-storage`'s `Upload` class under the hood — S3's `PutObject` needs a known `Content-Length` up front, which a raw stream doesn't have, so `Upload` multipart-uploads in bounded-size parts instead, keeping memory use flat regardless of file size. Install `@aws-sdk/lib-storage` alongside `@aws-sdk/client-s3` to use it.

## Next Steps

- [WebSockets](./websockets) - Real-time bidirectional connections
- [AI Assistant](./ai) - `@nyalajs/ai`'s provider interface
