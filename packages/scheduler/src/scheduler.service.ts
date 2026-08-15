import * as cron from "node-cron";
import { Injectable, Container, OnApplicationBootstrap, OnApplicationShutdown } from "@nyalajs/core";
import { SCHEDULED_METADATA, ScheduledOptions } from "./decorators/scheduled";
import { DistributedLock, NoopDistributedLock, RedisDistributedLock } from "./distributed-lock";

interface ScheduledTaskDef extends ScheduledOptions {
    method: string | symbol;
}

export interface SchedulerConfig {
    /**
     * Redis connection string. When set, every @Scheduled() job acquires a
     * distributed lock before running, so scaling the app to multiple
     * replicas doesn't cause each job to fire once per replica. Without
     * this, the scheduler behaves exactly as it always has — every job
     * just runs, no duplicate-execution protection, correct only for a
     * single running instance.
     */
    redisUrl?: string;
}

const DEFAULT_LOCK_TTL_MS = 60_000;

@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private scheduledJobs: cron.ScheduledTask[] = [];
    private lock: DistributedLock = new NoopDistributedLock();
    private redisClient: any;

    constructor(private readonly container: Container) { }

    /**
     * Opt into distributed-lock coordination. Call this during bootstrap,
     * before onApplicationBootstrap() runs (i.e. before the kernel starts
     * the app), the same way QueueService.connect() is called explicitly
     * rather than happening automatically from config alone.
     */
    async connect(config: SchedulerConfig = {}): Promise<void> {
        if (!config.redisUrl) {
            console.log(
                "[nyala/scheduler] No redisUrl configured — jobs run with no distributed lock. " +
                "Safe only when exactly one instance of this app is running; scaling out will duplicate every job run."
            );
            return;
        }

        let Redis: any;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            Redis = require("ioredis");
        } catch {
            throw new Error(
                '[nyala/scheduler] redisUrl was configured but the optional peer dependency "ioredis" is not installed. ' +
                "Run: npm install ioredis — or omit redisUrl to intentionally run with no distributed lock."
            );
        }

        this.redisClient = new Redis(config.redisUrl);
        this.lock = new RedisDistributedLock(this.redisClient);
        console.log("[nyala/scheduler] Distributed locking enabled via Redis.");
    }

    onApplicationBootstrap(): void {
        const providers = this.container.getProviders();

        for (const [token, _] of providers.entries()) {
            if (typeof token !== "function") continue;

            const tasks: ScheduledTaskDef[] = Reflect.getMetadata(SCHEDULED_METADATA, token) ?? [];
            if (tasks.length === 0) continue;

            const instance = this.container.resolve<any>(token);

            for (const task of tasks) {
                const jobName = task.name ?? `${token.name}.${String(task.method)}`;
                const lockTtlMs = task.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;

                const job = cron.schedule(
                    task.cron,
                    async () => {
                        const acquired = await this.lock.acquire(jobName, lockTtlMs);
                        if (!acquired) {
                            // Another replica holds the lock for this tick — expected
                            // and silent in normal multi-replica operation, not an error.
                            return;
                        }

                        try {
                            await instance[task.method]();
                        } catch (error) {
                            console.error(`[Scheduler] Error running job '${jobName}':`, error);
                        }
                    },
                    {
                        scheduled: true,
                        timezone: task.timezone,
                        name: jobName,
                    }
                );

                this.scheduledJobs.push(job);
                console.log(`[Scheduler] Registered cron job '${jobName}' (${task.cron})`);
            }
        }
    }

    async onApplicationShutdown(): Promise<void> {
        for (const job of this.scheduledJobs) {
            job.stop();
        }
        this.scheduledJobs = [];

        if (this.redisClient) {
            await this.redisClient.quit();
        }
    }
}
