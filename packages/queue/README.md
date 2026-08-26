# @nyalajs/queue

Background job dispatch for Nyala.js. `QueueService` gives you one small API — `dispatch()` / `process()` — backed by [BullMQ](https://docs.bullmq.io/) + Redis in production, with a zero-dependency in-memory fallback for local dev.

## Quick start

```ts
import { QueueService } from "@nyalajs/queue";

const queue = new QueueService();
await queue.connect({ url: process.env.REDIS_URL }); // omit `url` -> in-memory, non-persistent

await queue.process("mail", async (job) => {
  await sendWelcomeEmail(job.data.userId);
});

await queue.dispatch("mail", "send-welcome", { userId: user.id });
```

`QueueService` is `@Injectable()` — resolve it through DI like any other provider. A module-level `dispatch()` helper (via `setGlobalQueue()`) is also available for call sites that can't take a constructor-injected dependency.

Durability is explicit, not silently degraded: calling `connect({ url })` without the `bullmq` peer dependency installed throws immediately rather than quietly falling back to in-memory (which would drop every job on restart with nothing louder than a log line). Omit `url` entirely to intentionally opt into in-memory mode.

## Dashboard

`@nyalajs/queue` ships a [bull-board](https://github.com/felixmosh/bull-board) integration for real-time queue/job introspection — active/waiting/failed counts, job payloads, retry, and a live view of what's actually happening in Redis.

```ts
import { FastifyAdapter } from "@nyalajs/http";
import { QueueService, mountQueueDashboard } from "@nyalajs/queue";

const queue = new QueueService();
await queue.connect({ url: process.env.REDIS_URL });
await queue.process("mail", handler);

const httpAdapter = new FastifyAdapter();
// ... register your app's routes/modules on httpAdapter as usual ...

await mountQueueDashboard(httpAdapter.getInstance(), queue, {
  basePath: "/admin/queues", // default
});
```

Visiting `/admin/queues` now serves the bull-board UI, reading directly from the same BullMQ `Queue` instances your app dispatches to.

A few things worth knowing:

- **Requires a durable QueueService.** `mountQueueDashboard()` throws if `queue` is still in in-memory mode (`connect()` was called without a `url`) — there's nothing in Redis for the dashboard to show.
- **Queues appear once they're used.** A queue only exists (and shows up on the dashboard) after something has called `dispatch()` or `process()` for that name — there's no eager pre-registration.
- **Late-registered queues need `refresh()`.** The dashboard snapshots known queues at mount time. If you call `process()` for a new queue name *after* mounting, call the returned handle's `refresh()` to pick it up:

  ```ts
  const dashboard = await mountQueueDashboard(httpAdapter.getInstance(), queue);
  // ... later, a new queue is registered ...
  await queue.process("reports", handler);
  dashboard.refresh();
  ```

- **Put it behind auth.** `mountQueueDashboard()` mounts the raw bull-board UI with no access control of its own — put it behind your app's auth middleware/guards (e.g. only mount it inside an admin-only route group, or gate the path at your reverse proxy) before deploying it anywhere reachable from outside your network.

### Peer dependencies

The dashboard is opt-in: `@bull-board/api` and `@bull-board/fastify` are optional peer dependencies, only required if you call `mountQueueDashboard()`.

```bash
npm install @bull-board/api @bull-board/fastify
```

Pin to the `^8.x` line of both — bull-board 9.x requires Fastify 5, and `@nyalajs/http` runs on Fastify 4.

## In-memory mode

Without a Redis URL, `QueueService` uses a simple in-process queue: `dispatch()` runs any already-registered handler immediately, and jobs dispatched before a handler exists are queued and flushed once one is registered. This is meant for local development only — nothing is persisted, and jobs are lost on restart. `mountQueueDashboard()` intentionally refuses to run against it.

## API

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
