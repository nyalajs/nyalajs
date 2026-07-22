import * as cron from "node-cron";
import { Injectable, Container, OnApplicationBootstrap, OnApplicationShutdown } from "@nyala/core";
import { SCHEDULED_METADATA, ScheduledOptions } from "./decorators/scheduled";

interface ScheduledTaskDef extends ScheduledOptions {
    method: string | symbol;
}

@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private scheduledJobs: cron.ScheduledTask[] = [];

    constructor(private readonly container: Container) { }

    onApplicationBootstrap(): void {
        const providers = this.container.getProviders();

        for (const [token, _] of providers.entries()) {
            if (typeof token !== "function") continue;

            const tasks: ScheduledTaskDef[] = Reflect.getMetadata(SCHEDULED_METADATA, token) ?? [];
            if (tasks.length === 0) continue;

            const instance = this.container.resolve<any>(token);

            for (const task of tasks) {
                const jobName = task.name ?? `${token.name}.${String(task.method)}`;

                const job = cron.schedule(
                    task.cron,
                    async () => {
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

    onApplicationShutdown(): void {
        for (const job of this.scheduledJobs) {
            job.stop();
        }
        this.scheduledJobs = [];
    }
}
