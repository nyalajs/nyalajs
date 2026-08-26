import { Injectable } from "@nyalajs/core";

export interface QueueConfig {
    /** Redis connection string (e.g. redis://localhost:6379). Required for BullMQ. */
    url?: string;
}

export interface JobPayload {
    [key: string]: unknown;
}

/** Simple in-process queue for use without Redis. */
class InMemoryQueue {
    private queues = new Map<string, Array<{ name: string; data: JobPayload }>>();
    private handlers = new Map<string, (job: { data: JobPayload }) => Promise<void>>();

    async add(queueName: string, jobName: string, data: JobPayload): Promise<void> {
        if (!this.queues.has(queueName)) this.queues.set(queueName, []);
        this.queues.get(queueName)!.push({ name: jobName, data });

        // If a handler is already registered, run it immediately (sync-like in-memory mode)
        const handler = this.handlers.get(queueName);
        if (handler) {
            const jobs = this.queues.get(queueName)!.splice(0);
            for (const job of jobs) {
                await handler(job).catch(console.error);
            }
        }
    }

    registerWorker(queueName: string, handler: (job: { data: JobPayload }) => Promise<void>): void {
        this.handlers.set(queueName, handler);
    }

    async close(): Promise<void> {
        this.queues.clear();
        this.handlers.clear();
    }
}

@Injectable()
export class QueueService {
    private useBullMQ = false;
    private inMemory = new InMemoryQueue();

    // Lazily loaded BullMQ instances
    private bullQueues = new Map<string, any>();
    private bullWorkers = new Map<string, any>();
    private redisUrl?: string;

    async connect(config: QueueConfig = {}): Promise<void> {
        if (!config.url) {
            // No Redis URL means the caller is intentionally not using a durable
            // queue (e.g. local dev) — the in-memory queue is the expected,
            // documented behavior here, not a degraded fallback.
            console.log(
                "[nyala/queue] No queue URL configured — using an in-process, non-persistent queue. Do not use this in production."
            );
            return;
        }

        try {
            // @ts-ignore — bullmq is a peer dep
            await import("bullmq");
        } catch {
            // A URL was given, so the caller explicitly asked for a durable,
            // Redis-backed queue. Silently falling back to in-memory here would
            // mean jobs are dropped on every restart with nothing louder than a
            // buried console.warn — fail loudly instead.
            throw new Error(
                '[nyala/queue] A queue URL was configured (expecting a durable, Redis-backed queue via BullMQ) but the optional peer dependency "bullmq" is not installed. ' +
                "Run: npm install bullmq — or omit `url` to intentionally use the in-memory queue (not safe for production)."
            );
        }

        this.redisUrl = config.url;
        this.useBullMQ = true;
        console.log("[nyala/queue] Using BullMQ with Redis.");
    }

    /**
     * Dispatch a job to the named queue.
     */
    async dispatch(queueName: string, jobName: string, data: JobPayload = {}): Promise<void> {
        if (this.useBullMQ) {
            const queue = await this.getBullQueue(queueName);
            await queue.add(jobName, data);
        } else {
            await this.inMemory.add(queueName, jobName, data);
        }
    }

    /**
     * Register a processor (worker) for the named queue.
     */
    async process(
        queueName: string,
        handler: (job: { data: JobPayload }) => Promise<void>
    ): Promise<void> {
        if (this.useBullMQ) {
            // @ts-ignore — bullmq is a peer dep
            const { Worker } = await import("bullmq");
            const url = new URL(this.redisUrl!);
            const worker = new Worker(queueName, handler, {
                connection: {
                    host: url.hostname,
                    port: Number(url.port) || 6379,
                },
            });
            this.bullWorkers.set(queueName, worker);
            // Ensure a Queue object exists for this name too, even if nothing
            // has dispatch()ed to it yet — getQueues() (and anything built on
            // it, e.g. the dashboard) should see every queue that has a
            // consumer, not only ones that have already sent a job.
            await this.getBullQueue(queueName);
        } else {
            this.inMemory.registerWorker(queueName, handler);
        }
    }

    async close(): Promise<void> {
        if (this.useBullMQ) {
            for (const worker of this.bullWorkers.values()) await worker.close();
            for (const queue of this.bullQueues.values()) await queue.close();
        } else {
            await this.inMemory.close();
        }
    }

    /**
     * Whether this service is backed by real BullMQ/Redis (vs. the in-memory
     * fallback). Dashboards and other introspection tooling should check this
     * before calling getQueues() — the in-memory mode has no BullMQ Queue
     * instances to expose.
     */
    isDurable(): boolean {
        return this.useBullMQ;
    }

    /**
     * The live BullMQ `Queue` instances this service has created so far (one
     * per distinct queue name passed to dispatch()/process()). Exposed so
     * tooling — e.g. @nyalajs/queue's dashboard integration — can attach to
     * them directly instead of QueueService needing to know about every
     * possible consumer.
     *
     * Only ever populated in durable (BullMQ) mode; empty in in-memory mode.
     * A queue only appears once something has actually dispatched to it or
     * registered a processor for it — there is no eager pre-creation.
     */
    getQueues(): Map<string, any> {
        return this.bullQueues;
    }

    private async getBullQueue(name: string): Promise<any> {
        if (!this.bullQueues.has(name)) {
            // @ts-ignore — bullmq is a peer dep
            const { Queue } = await import("bullmq");
            const url = new URL(this.redisUrl!);
            const queue = new Queue(name, {
                connection: {
                    host: url.hostname,
                    port: Number(url.port) || 6379,
                },
            });
            this.bullQueues.set(name, queue);
        }
        return this.bullQueues.get(name);
    }
}

/**
 * Singleton module-level reference to the QueueService, set during bootstrap.
 * Allows `dispatch()` to be called from anywhere without DI.
 */
let _globalQueue: QueueService | null = null;

export function setGlobalQueue(service: QueueService): void {
    _globalQueue = service;
}

/**
 * Dispatch a job from anywhere in the application without injecting QueueService.
 *
 * @example
 * await dispatch("mail", "send-welcome", { userId: user.id });
 */
export async function dispatch(
    queueName: string,
    jobName: string,
    data: JobPayload = {}
): Promise<void> {
    if (!_globalQueue) {
        throw new Error("[nyala/queue] QueueService not initialised. Call setGlobalQueue() during bootstrap.");
    }
    await _globalQueue.dispatch(queueName, jobName, data);
}
