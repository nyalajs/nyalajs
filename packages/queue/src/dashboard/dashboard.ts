import type { QueueService } from "../queue.service";

export interface DashboardOptions {
    /**
     * URL path the dashboard UI (and its API) is mounted under.
     * @default "/admin/queues"
     */
    basePath?: string;
}

export interface QueueDashboardHandle {
    /** Re-scans QueueService.getQueues() and adds any new queues to the board that were created after mounting (e.g. a process() call registered later). Already-added queues are left alone. */
    refresh(): void;
}

/**
 * Mounts a bull-board dashboard (queue/job introspection UI) onto an
 * existing Fastify instance, backed by the live BullMQ Queue instances a
 * QueueService has created.
 *
 * This is deliberately a standalone function rather than something wired
 * automatically into FastifyAdapter: bull-board's packages
 * (`@bull-board/api`, `@bull-board/fastify`) are optional peer deps of
 * @nyalajs/queue, and most apps — including every one running in-memory
 * mode — have no use for a dashboard at all.
 *
 * @example
 * ```ts
 * import { FastifyAdapter } from "@nyalajs/http";
 * import { mountQueueDashboard } from "@nyalajs/queue";
 *
 * const httpAdapter = new FastifyAdapter();
 * // ... after QueueService.connect() and any process() registrations ...
 * await mountQueueDashboard(httpAdapter.getInstance(), queueService, {
 *   basePath: "/admin/queues",
 * });
 * ```
 *
 * Requires `bullmq`, `@bull-board/api`, and `@bull-board/fastify` to be
 * installed — throws a clear error naming whichever is missing rather than
 * silently no-op'ing.
 */
export async function mountQueueDashboard(
    fastifyInstance: any,
    queueService: QueueService,
    options: DashboardOptions = {}
): Promise<QueueDashboardHandle> {
    if (!queueService.isDurable()) {
        throw new Error(
            "[nyala/queue] mountQueueDashboard() requires a durable (BullMQ/Redis) QueueService. " +
            "Call connect({ url }) with a Redis URL before mounting the dashboard — the in-memory " +
            "fallback has no BullMQ queues to inspect."
        );
    }

    let createBullBoard: any;
    let BullMQAdapter: any;
    let FastifyAdapter: any;
    try {
        // @ts-ignore — optional peer dep
        ({ createBullBoard } = await import("@bull-board/api"));
        // @ts-ignore — optional peer dep
        ({ BullMQAdapter } = await import("@bull-board/api/bullMQAdapter"));
    } catch {
        throw new Error(
            '[nyala/queue] mountQueueDashboard() requires the optional peer dependency "@bull-board/api". ' +
            "Run: npm install @bull-board/api @bull-board/fastify"
        );
    }
    try {
        // @ts-ignore — optional peer dep
        ({ FastifyAdapter } = await import("@bull-board/fastify"));
    } catch {
        throw new Error(
            '[nyala/queue] mountQueueDashboard() requires the optional peer dependency "@bull-board/fastify". ' +
            "Run: npm install @bull-board/api @bull-board/fastify"
        );
    }

    const basePath = options.basePath ?? "/admin/queues";

    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath(basePath);

    const known = queueService.getQueues();
    const mountedNames = new Set(known.keys());
    const queues = Array.from(known.values()).map((queue) => new BullMQAdapter(queue));

    const board = createBullBoard({
        queues,
        serverAdapter,
    });

    await fastifyInstance.register(serverAdapter.registerPlugin(), { prefix: basePath });

    return {
        refresh(): void {
            for (const [name, queue] of queueService.getQueues()) {
                if (mountedNames.has(name)) continue;
                board.addQueue(new BullMQAdapter(queue));
                mountedNames.add(name);
            }
        },
    };
}
