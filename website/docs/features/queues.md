# Queues

`@nyalajs/queue` gives you one small API — `dispatch()` / `process()` — for background job processing, backed by [BullMQ](https://docs.bullmq.io/) + Redis in production, with a zero-dependency in-memory fallback for local dev. It also ships a real-time dashboard for inspecting queues and jobs.

## Quick start

```typescript
import { QueueService } from '@nyalajs/queue';

const queue = new QueueService();
await queue.connect({ url: process.env.REDIS_URL }); // omit `url` -> in-memory, non-persistent

await queue.process('mail', async (job) => {
  await sendWelcomeEmail(job.data.userId);
});

await queue.dispatch('mail', 'send-welcome', { userId: user.id });
```

`QueueService` is `@Injectable()` — resolve it through DI like any other provider:

```typescript
@Injectable()
export class SignupService {
  constructor(private queue: QueueService) {}

  async register(user: User) {
    await this.queue.dispatch('mail', 'send-welcome', { userId: user.id });
  }
}
```

A module-level `dispatch()` helper is also available for call sites that can't take a constructor-injected dependency (e.g. static utility functions):

```typescript
import { setGlobalQueue, dispatch } from '@nyalajs/queue';

// During bootstrap:
setGlobalQueue(queueService);

// Anywhere else:
await dispatch('mail', 'send-welcome', { userId: user.id });
```

## Durability is explicit

Calling `connect({ url })` without the `bullmq` peer dependency installed **throws immediately** rather than quietly falling back to in-memory — a durable queue silently degrading to in-memory would drop every job on restart with nothing louder than a buried log line. Omit `url` entirely to intentionally opt into in-memory mode (local dev only):

```typescript
await queue.connect(); // logs a warning, uses the in-process fallback — not for production
```

Without a Redis URL, `dispatch()` runs any already-registered handler for that queue immediately; jobs dispatched before a handler exists are held and flushed once one is registered. Nothing is persisted, and jobs are lost on restart.

## Dashboard

`@nyalajs/queue` ships a [bull-board](https://github.com/felixmosh/bull-board) integration for real-time queue/job introspection: active/waiting/failed counts, job payloads, retries, and a live view of what's actually happening in Redis.

```typescript
import { FastifyAdapter } from '@nyalajs/http';
import { QueueService, mountQueueDashboard } from '@nyalajs/queue';

const queue = new QueueService();
await queue.connect({ url: process.env.REDIS_URL });
await queue.process('mail', handler);

const httpAdapter = new FastifyAdapter();
// ... register your app's modules on httpAdapter as usual ...

await mountQueueDashboard(httpAdapter.getInstance(), queue, {
  basePath: '/admin/queues', // default
});
```

Visiting `/admin/queues` now serves the bull-board UI, reading directly from the same BullMQ `Queue` instances your app dispatches to — no separate data layer to keep in sync.

### Peer dependencies

The dashboard is opt-in: `@bull-board/api` and `@bull-board/fastify` are optional peer dependencies, only required if you call `mountQueueDashboard()`.

```bash
npm install @bull-board/api @bull-board/fastify
```

Pin both to the `^8.x` line — bull-board 9.x requires Fastify 5, and `@nyalajs/http` runs on Fastify 4.

### Requires a durable QueueService

`mountQueueDashboard()` throws if `queue` is still in in-memory mode — there's nothing in Redis for the dashboard to read:

```typescript
await queue.connect(); // in-memory
await mountQueueDashboard(httpAdapter.getInstance(), queue);
// Error: mountQueueDashboard() requires a durable (BullMQ/Redis) QueueService.
```

### Queues appear once they're used

A queue only exists — and only shows up on the dashboard — after something has called `dispatch()` or `process()` for that name. There's no eager pre-registration.

### Late-registered queues need `refresh()`

The dashboard snapshots known queues at mount time. If you register a new queue name *after* mounting, call the returned handle's `refresh()` to pick it up:

```typescript
const dashboard = await mountQueueDashboard(httpAdapter.getInstance(), queue);

// ... later, a new queue is registered ...
await queue.process('reports', handler);
dashboard.refresh();
```

### Put it behind auth

`mountQueueDashboard()` mounts the raw bull-board UI with **no access control of its own**. Put it behind your app's auth middleware/guards — for example, only mount it inside an admin-only route group, or gate the path at your reverse proxy — before deploying anywhere reachable from outside your network.

## API reference

| Method | Description |
|---|---|
| `connect(config?)` | `{ url }` for durable BullMQ/Redis mode; omit for in-memory. |
| `dispatch(queueName, jobName, data?)` | Enqueue a job. |
| `process(queueName, handler)` | Register a worker/handler for a queue. |
| `isDurable()` | Whether this instance is backed by real BullMQ/Redis. |
| `getQueues()` | The live `Map<string, Queue>` of BullMQ queues created so far — mainly for tooling like the dashboard. |
| `close()` | Gracefully close all workers/queues (or the in-memory store). |
| `mountQueueDashboard(fastifyInstance, queueService, options?)` | Mount the bull-board UI onto a Fastify instance. |
| `setGlobalQueue(service)` / `dispatch(queueName, jobName, data?)` | Module-level dispatch without DI. |

## What's NOT Included

- **No job scheduling UI beyond what bull-board exposes** — cron-style repeatable jobs are configured through BullMQ's own `Queue` options directly (`getQueues()` gives you the raw instance), not through a Nyala-specific API.
- **No built-in retry/backoff policy** beyond BullMQ's own per-job `attempts`/`backoff` options passed at `add()` time — `QueueService.dispatch()` doesn't currently expose job options, so use `getQueues()` to reach the underlying `Queue` for anything beyond default behavior.
- **No dead-letter queue wiring** — a permanently-failed job stays in BullMQ's `failed` set, visible (and retryable) from the dashboard, but nothing auto-routes it elsewhere.
- **No multi-tenancy-aware queue partitioning** — queue names are global; namespace them yourself (e.g. `mail:${tenantId}`) if tenant isolation matters for your jobs.

## Next Steps

- [Microservices](./microservices) - Message-pattern RPC, a different way to move work between processes
- [Streaming](./streaming) - Server-Sent Events and file streaming
- [Storage](./storage) - Disk abstraction for file uploads, often dispatched to a queue for processing
