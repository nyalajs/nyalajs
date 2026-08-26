import "reflect-metadata";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { QueueService } from "../queue.service";
import { mountQueueDashboard } from "../dashboard/dashboard";

// Requires a real Redis instance. Matches the rest of this repo's testing
// philosophy: verify against real infrastructure, not mocks. Point at the
// scratch Redis container started for this work (see session notes) — CI/dev
// can override via QUEUE_TEST_REDIS_URL.
const REDIS_URL = process.env.QUEUE_TEST_REDIS_URL ?? "redis://127.0.0.1:6390";

describe("mountQueueDashboard (e2e, real Redis + real Fastify)", () => {
    let app: FastifyInstance;
    let queueService: QueueService;

    beforeEach(async () => {
        app = Fastify();
        queueService = new QueueService();
    });

    afterEach(async () => {
        await queueService.close().catch(() => undefined);
        await app.close().catch(() => undefined);
    });

    it("refuses to mount against an in-memory (non-durable) QueueService", async () => {
        await queueService.connect(); // no url -> in-memory
        await expect(mountQueueDashboard(app, queueService)).rejects.toThrow(/durable/i);
    });

    it("mounts the dashboard API and serves real queue/job data from BullMQ", async () => {
        await queueService.connect({ url: REDIS_URL });

        const queueName = `dash-test-${Date.now()}`;
        const received: unknown[] = [];
        await queueService.process(queueName, async (job) => {
            received.push(job.data);
        });
        await queueService.dispatch(queueName, "job1", { hello: "world" });

        // Give BullMQ's worker a moment to actually pick up and complete the job
        // against the real Redis instance before we ask the dashboard about it.
        await new Promise((resolve) => {
            const check = setInterval(() => {
                if (received.length > 0) {
                    clearInterval(check);
                    resolve(undefined);
                }
            }, 50);
        });

        const handle = await mountQueueDashboard(app, queueService, { basePath: "/admin/queues" });
        expect(handle.refresh).toBeInstanceOf(Function);

        await app.ready();

        const res = await app.inject({ method: "GET", url: "/admin/queues/api/queues" });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        const found = body.queues.find((q: any) => q.name === queueName);
        expect(found).toBeDefined();
        expect(found.counts.completed).toBeGreaterThanOrEqual(1);
        expect(found.type).toBe("bullmq");
    });

    it("refresh() picks up a queue created after the dashboard was mounted", async () => {
        await queueService.connect({ url: REDIS_URL });

        const firstQueue = `dash-first-${Date.now()}`;
        await queueService.process(firstQueue, async () => undefined);

        const handle = await mountQueueDashboard(app, queueService, { basePath: "/admin/queues" });
        await app.ready();

        const secondQueue = `dash-second-${Date.now()}`;
        await queueService.process(secondQueue, async () => undefined);

        // Before refresh(): the second queue must NOT be visible yet — proves
        // the board really did snapshot at mount time rather than always
        // reading QueueService live (which would make refresh() meaningless).
        let res = await app.inject({ method: "GET", url: "/admin/queues/api/queues" });
        let names = res.json().queues.map((q: any) => q.name);
        expect(names).toContain(firstQueue);
        expect(names).not.toContain(secondQueue);

        handle.refresh();

        res = await app.inject({ method: "GET", url: "/admin/queues/api/queues" });
        names = res.json().queues.map((q: any) => q.name);
        expect(names).toContain(firstQueue);
        expect(names).toContain(secondQueue);
    });

    it("real dispatched job data round-trips through the dashboard job list", async () => {
        await queueService.connect({ url: REDIS_URL });

        const queueName = `dash-jobdata-${Date.now()}`;
        // Don't register a processor — leave the job sitting in "waiting" so
        // we can inspect its actual payload via the dashboard API rather
        // than just counts.
        await queueService.dispatch(queueName, "special-job", { orderId: 42, note: "verify-me" });

        const handle = await mountQueueDashboard(app, queueService, { basePath: "/admin/queues" });
        void handle;
        await app.ready();

        // bull-board only populates a queue's `jobs` array when the request
        // names it as the "active" (currently open in the UI) queue — a bare
        // listing only returns counts. Mirrors what the dashboard UI itself
        // sends when a user opens a specific queue.
        const res = await app.inject({
            method: "GET",
            url: `/admin/queues/api/queues?activeQueue=${encodeURIComponent(queueName)}&status=latest`,
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const queue = body.queues.find((q: any) => q.name === queueName);
        expect(queue).toBeDefined();
        const job = queue.jobs.find((j: any) => j.name === "special-job");
        expect(job).toBeDefined();
        expect(job.data).toEqual({ orderId: 42, note: "verify-me" });
    });
});
