import "reflect-metadata";

export const SCHEDULED_METADATA = "nyala:scheduled";

export interface ScheduledOptions {
    /** The cron expression. E.g. "* * * * *" for every minute. */
    cron: string;
    /** Optional timezone. */
    timezone?: string;
    /** Name of the job, for logging/debugging. Also the distributed lock key. */
    name?: string;
    /**
     * How long this job's distributed lock is held for, in milliseconds
     * (default 60000). Only matters when SchedulerService is configured
     * with a DistributedLock (see connect() and REDIS_URL) — with no lock
     * configured, every tick just runs, same as before distributed locking
     * existed. Size this comfortably longer than the job is expected to
     * take: if the job runs longer than the TTL, the lock expires and
     * ANOTHER replica could acquire it and run a second, overlapping copy.
     */
    lockTtlMs?: number;
}

/**
 * Decorator that schedules a method to run automatically via cron.
 *
 * @example
 *   @Injectable()
 *   export class CleanupTask {
 *     @Scheduled({ cron: "0 0 * * *" })
 *     async runDaily() { ... }
 *   }
 */
export function Scheduled(cronOrOptions: string | ScheduledOptions): MethodDecorator {
    return (target: any, propertyKey: string | symbol) => {
        const options: ScheduledOptions = typeof cronOrOptions === "string"
            ? { cron: cronOrOptions }
            : cronOrOptions;

        const scheduledTasks = Reflect.getMetadata(SCHEDULED_METADATA, target.constructor) ?? [];
        scheduledTasks.push({ ...options, method: propertyKey });
        Reflect.defineMetadata(SCHEDULED_METADATA, scheduledTasks, target.constructor);
    };
}
