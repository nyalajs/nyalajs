import "reflect-metadata";

export const SCHEDULED_METADATA = "nyala:scheduled";

export interface ScheduledOptions {
    /** The cron expression. E.g. "* * * * *" for every minute. */
    cron: string;
    /** Optional timezone. */
    timezone?: string;
    /** Name of the job, for logging/debugging. */
    name?: string;
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
