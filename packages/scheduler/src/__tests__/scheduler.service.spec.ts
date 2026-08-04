import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Container, Injectable } from "@nyalajs/core";
import { SchedulerService } from "../scheduler.service";
import { Scheduled } from "../decorators/scheduled";

// vi.mock() calls are hoisted above imports by vitest's transform, so
// SchedulerService's `import * as cron from "node-cron"` resolves to this.
// scheduleMock has to come from vi.hoisted() — a plain top-level const
// would run *after* the hoisted vi.mock() factory tries to reference it.
const { scheduleMock } = vi.hoisted(() => ({ scheduleMock: vi.fn() }));
vi.mock("node-cron", () => ({
    schedule: (...args: unknown[]) => scheduleMock(...args),
}));

@Injectable()
class CleanupTask {
    ran = 0;
    @Scheduled({ cron: "0 0 * * *", name: "nightly-cleanup" })
    async runDaily() {
        this.ran++;
    }
}

@Injectable()
class FailingTask {
    @Scheduled("* * * * *")
    async run() {
        throw new Error("job blew up");
    }
}

describe("SchedulerService", () => {
    let fakeJob: { stop: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        fakeJob = { stop: vi.fn() };
        scheduleMock.mockReset();
        scheduleMock.mockReturnValue(fakeJob);
    });

    it("registers a cron.schedule() call for each @Scheduled method found in the container", () => {
        const container = new Container();
        container.register(CleanupTask);
        const scheduler = new SchedulerService(container);

        scheduler.onApplicationBootstrap();

        expect(scheduleMock).toHaveBeenCalledTimes(1);
        const [cronExpr, , options] = scheduleMock.mock.calls[0];
        expect(cronExpr).toBe("0 0 * * *");
        expect((options as any).name).toBe("nightly-cleanup");
    });

    it("derives a default job name from the class and method when none is given", () => {
        const container = new Container();
        container.register(FailingTask);
        const scheduler = new SchedulerService(container);

        scheduler.onApplicationBootstrap();

        const [, , options] = scheduleMock.mock.calls[0];
        expect((options as any).name).toBe("FailingTask.run");
    });

    it("the scheduled callback invokes the actual instance method", async () => {
        const container = new Container();
        container.register(CleanupTask);
        const scheduler = new SchedulerService(container);

        scheduler.onApplicationBootstrap();
        const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
        await callback();

        const task = container.resolve(CleanupTask);
        expect(task.ran).toBe(1);
    });

    it("catches an error thrown by the scheduled method instead of crashing", async () => {
        const container = new Container();
        container.register(FailingTask);
        const scheduler = new SchedulerService(container);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        scheduler.onApplicationBootstrap();
        const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;

        await expect(callback()).resolves.not.toThrow();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FailingTask.run"), expect.any(Error));
        errorSpy.mockRestore();
    });

    it("stops every registered job on shutdown", () => {
        const container = new Container();
        container.register(CleanupTask);
        const scheduler = new SchedulerService(container);

        scheduler.onApplicationBootstrap();
        scheduler.onApplicationShutdown();

        expect(fakeJob.stop).toHaveBeenCalledOnce();
    });

    it("does nothing for providers with no @Scheduled methods", () => {
        @Injectable()
        class PlainService {}

        const container = new Container();
        container.register(PlainService);
        const scheduler = new SchedulerService(container);

        scheduler.onApplicationBootstrap();

        expect(scheduleMock).not.toHaveBeenCalled();
    });
});
