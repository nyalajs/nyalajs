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
        if (config.url) {
            try {
                // Verify BullMQ is installed
                // @ts-ignore — bullmq is a peer dep
                await import("bullmq");
                this.redisUrl = config.url;
                this.useBullMQ = true;
                console.log("[nyala/queue] Using BullMQ with Redis.");
            } catch {
                console.warn(
                    "[nyala/queue] bullmq not installed — falling back to in-memory queue."
                );
            }
        }
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
