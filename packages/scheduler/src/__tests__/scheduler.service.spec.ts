import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Container, Injectable } from "@nyalajs/core";
import { SchedulerService } from "../scheduler.service";
import { Scheduled } from "../decorators/scheduled";
import { DistributedLock } from "../distributed-lock";

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

    describe("distributed locking — regression coverage for duplicate-job-run-across-replicas", () => {
        // Real fake DistributedLock this describe block injects directly via
        // (scheduler as any).lock — SchedulerService's `lock` field is
        // private and only otherwise reachable through connect(), which
        // needs a real/mocked ioredis; asserting the actual lock-checking
        // behavior in SchedulerService itself is cleaner done by injecting a
        // fake lock than mocking the whole ioredis module here (that's
        // covered separately, for connect() itself, below).
        function fakeLock(acquireResult: boolean | boolean[]): DistributedLock {
            const results = Array.isArray(acquireResult) ? [...acquireResult] : undefined;
            return {
                acquire: vi.fn(async () => (results ? (results.shift() ?? false) : (acquireResult as boolean))),
            };
        }

        it("runs the job when the lock is acquired", async () => {
            const container = new Container();
            container.register(CleanupTask);
            const scheduler = new SchedulerService(container);
            (scheduler as any).lock = fakeLock(true);

            scheduler.onApplicationBootstrap();
            const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
            await callback();

            const task = container.resolve(CleanupTask);
            expect(task.ran).toBe(1);
        });

        it("skips the job silently when the lock is NOT acquired (another replica holds it)", async () => {
            const container = new Container();
            container.register(CleanupTask);
            const scheduler = new SchedulerService(container);
            (scheduler as any).lock = fakeLock(false);

            scheduler.onApplicationBootstrap();
            const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
            await callback();

            const task = container.resolve(CleanupTask);
            expect(task.ran).toBe(0);
        });

        it("simulates two replicas racing for the same tick — only one runs the job", async () => {
            // A single shared fake lock, "acquired" by whichever of the two
            // SchedulerService instances calls acquire() first — the same
            // shape a real Redis SET NX lock enforces across real replicas.
            let held = false;
            const sharedLock: DistributedLock = {
                acquire: vi.fn(async () => {
                    if (held) return false;
                    held = true;
                    return true;
                }),
            };

            const containerA = new Container();
            containerA.register(CleanupTask);
            const replicaA = new SchedulerService(containerA);
            (replicaA as any).lock = sharedLock;

            const containerB = new Container();
            containerB.register(CleanupTask);
            const replicaB = new SchedulerService(containerB);
            (replicaB as any).lock = sharedLock;

            scheduleMock.mockReset();
            scheduleMock.mockReturnValue(fakeJob);
            replicaA.onApplicationBootstrap();
            const callbackA = scheduleMock.mock.calls[0][1] as () => Promise<void>;

            scheduleMock.mockReset();
            scheduleMock.mockReturnValue(fakeJob);
            replicaB.onApplicationBootstrap();
            const callbackB = scheduleMock.mock.calls[0][1] as () => Promise<void>;

            await Promise.all([callbackA(), callbackB()]);

            const taskA = containerA.resolve(CleanupTask);
            const taskB = containerB.resolve(CleanupTask);
            expect(taskA.ran + taskB.ran).toBe(1);
        });

        it("passes the per-job lockTtlMs from @Scheduled() options through to lock.acquire()", async () => {
            @Injectable()
            class SlowTask {
                @Scheduled({ cron: "* * * * *", name: "slow-job", lockTtlMs: 300_000 })
                async run() {}
            }

            const container = new Container();
            container.register(SlowTask);
            const scheduler = new SchedulerService(container);
            const lock = fakeLock(true);
            (scheduler as any).lock = lock;

            scheduler.onApplicationBootstrap();
            const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
            await callback();

            expect(lock.acquire).toHaveBeenCalledWith("slow-job", 300_000);
        });

        it("defaults to a 60s lock TTL when @Scheduled() doesn't specify one", async () => {
            const container = new Container();
            container.register(CleanupTask);
            const scheduler = new SchedulerService(container);
            const lock = fakeLock(true);
            (scheduler as any).lock = lock;

            scheduler.onApplicationBootstrap();
            const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
            await callback();

            expect(lock.acquire).toHaveBeenCalledWith("nightly-cleanup", 60_000);
        });
    });

    describe("connect()", () => {
        it("with no redisUrl: logs a warning and leaves the default no-op lock in place (every job still runs, unprotected)", async () => {
            const container = new Container();
            container.register(CleanupTask);
            const scheduler = new SchedulerService(container);
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            await scheduler.connect();

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("no distributed lock"));

            scheduler.onApplicationBootstrap();
            const callback = scheduleMock.mock.calls[0][1] as () => Promise<void>;
            await callback();
            const task = container.resolve(CleanupTask);
            expect(task.ran).toBe(1);

            logSpy.mockRestore();
        });

        it("with a redisUrl: constructs a real ioredis client and switches to RedisDistributedLock", async () => {
            const container = new Container();
            const scheduler = new SchedulerService(container);
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

            // ioredis is genuinely installed in this monorepo (it's already
            // used by packages/http's rate limiting) — connect() for real.
            // The constructor connects asynchronously in the background and
            // returns immediately, so pointing at an unreachable port here
            // doesn't block or fail this test — it just never completes a
            // real handshake, which is fine since nothing here calls
            // .acquire() (that would actually need a live Redis).
            await scheduler.connect({ redisUrl: "redis://localhost:6399/0" });

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Distributed locking enabled"));
            expect((scheduler as any).lock.constructor.name).toBe("RedisDistributedLock");

            logSpy.mockRestore();
            // Real client was constructed — close it so the test process
            // can exit cleanly rather than leaving an open (never-connected,
            // lazyConnect) socket handle around.
            await (scheduler as any).redisClient.quit().catch(() => {});
        });
    });
});
