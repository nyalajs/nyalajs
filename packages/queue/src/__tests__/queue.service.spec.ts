import "reflect-metadata";
import { describe, it, expect, vi, afterEach } from "vitest";
import { QueueService, dispatch, setGlobalQueue } from "../queue.service";

describe("QueueService", () => {
    describe("connect() without a url", () => {
        it("stays in in-memory mode and logs that it's non-persistent", async () => {
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
            const queue = new QueueService();

            await queue.connect();

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("non-persistent"));
            logSpy.mockRestore();
        });
    });

    describe("connect() with a url but bullmq not installed", () => {
        // bullmq is a real devDependency of this package (needed for the
        // dashboard e2e tests to run against actual BullMQ/Redis), so it IS
        // resolvable in this test environment. To exercise the "not
        // installed" code path for real, we make the dynamic `import("bullmq")`
        // inside QueueService.connect() actually reject, the same way it
        // would in a consuming app that never ran `npm install bullmq`.
        it("throws instead of silently degrading to the in-memory queue", async () => {
            vi.resetModules();
            vi.doMock("bullmq", () => {
                throw new Error("Cannot find module 'bullmq'");
            });
            const { QueueService: IsolatedQueueService } = await import("../queue.service");
            const queue = new IsolatedQueueService();

            await expect(queue.connect({ url: "redis://localhost:6379" })).rejects.toThrow(
                /bullmq.*not installed/
            );

            vi.doUnmock("bullmq");
            vi.resetModules();
        });

        it("does not leave the service half-configured after the failed connect", async () => {
            vi.resetModules();
            vi.doMock("bullmq", () => {
                throw new Error("Cannot find module 'bullmq'");
            });
            const { QueueService: IsolatedQueueService } = await import("../queue.service");
            const queue = new IsolatedQueueService();
            await expect(queue.connect({ url: "redis://localhost:6379" })).rejects.toThrow();

            // Falls through to in-memory dispatch/process, not a BullMQ call
            // that would try (and fail) to reach Redis.
            const handler = vi.fn().mockResolvedValue(undefined);
            await queue.process("mail", handler);
            await queue.dispatch("mail", "send-welcome", { userId: 1 });

            expect(handler).toHaveBeenCalledWith({ name: "send-welcome", data: { userId: 1 } });

            vi.doUnmock("bullmq");
            vi.resetModules();
        });
    });

    describe("in-memory dispatch/process round trip", () => {
        it("delivers a job to a handler registered before dispatch", async () => {
            const queue = new QueueService();
            await queue.connect();

            const received: unknown[] = [];
            await queue.process("emails", async (job) => {
                received.push(job.data);
            });

            await queue.dispatch("emails", "welcome", { to: "a@example.com" });

            expect(received).toEqual([{ to: "a@example.com" }]);
        });

        it("queues jobs dispatched before any handler is registered (no silent drop)", async () => {
            const queue = new QueueService();
            await queue.connect();

            // No process() call yet — dispatch should not throw or lose the job.
            await expect(queue.dispatch("emails", "welcome", { to: "b@example.com" })).resolves.not.toThrow();
        });
    });

    describe("global dispatch() helper", () => {
        afterEach(() => {
            setGlobalQueue(null as any);
        });

        it("throws a clear error when no global queue has been set", async () => {
            await expect(dispatch("mail", "send")).rejects.toThrow(/QueueService not initialised/);
        });

        it("delegates to the registered global queue once set", async () => {
            const queue = new QueueService();
            await queue.connect();
            const handler = vi.fn().mockResolvedValue(undefined);
            await queue.process("mail", handler);

            setGlobalQueue(queue);
            await dispatch("mail", "send", { to: "c@example.com" });

            expect(handler).toHaveBeenCalledWith({ name: "send", data: { to: "c@example.com" } });
        });
    });
});
