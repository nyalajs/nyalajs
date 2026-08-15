import { describe, it, expect, vi, afterEach } from "vitest";
import { LogContext } from "@nyalajs/core";
import { Logger } from "../logging/logger";

function captureStdout() {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
        lines.push(chunk.toString());
        return true;
    });
    return { lines, spy };
}

describe("Logger", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.LOG_LEVEL;
    });

    it("writes structured JSON with the message, level, and serviceName", () => {
        const { lines, spy } = captureStdout();
        const logger = new Logger("my-service");

        logger.info("hello world", { userId: "u1" });
        spy.mockRestore();

        const entry = JSON.parse(lines[0]);
        expect(entry.level).toBe("info");
        expect(entry.msg).toBe("hello world");
        expect(entry.serviceName).toBe("my-service");
        expect(entry.userId).toBe("u1");
    });

    it("respects LOG_LEVEL — a debug call is suppressed when the level is info", () => {
        process.env.LOG_LEVEL = "info";
        const { lines, spy } = captureStdout();
        const logger = new Logger("my-service");

        logger.debug("should not appear");
        spy.mockRestore();

        expect(lines).toHaveLength(0);
    });

    it("includes the error's message, name, and stack for error()", () => {
        const { lines, spy } = captureStdout();
        const logger = new Logger("my-service");

        logger.error("failed", new Error("boom"));
        spy.mockRestore();

        const entry = JSON.parse(lines[0]);
        expect(entry.level).toBe("error");
        expect(entry.error.message).toBe("boom");
        expect(entry.error.name).toBe("Error");
        expect(entry.error.stack).toContain("Error: boom");
    });

    it("error() works without an Error object", () => {
        const { lines, spy } = captureStdout();
        const logger = new Logger("my-service");

        logger.error("failed with no error object");
        spy.mockRestore();

        const entry = JSON.parse(lines[0]);
        expect(entry.level).toBe("error");
        expect(entry.error).toBeUndefined();
    });

    it("child() creates a logger whose entries carry the extra bindings", () => {
        const { lines, spy } = captureStdout();
        const logger = new Logger("my-service");
        const child = logger.child({ requestId: "req-1" });

        child.info("scoped message");
        spy.mockRestore();

        const entry = JSON.parse(lines[0]);
        expect(entry.requestId).toBe("req-1");
        expect(entry.serviceName).toBe("my-service");
        expect(entry.msg).toBe("scoped message");
    });

    describe("automatic request correlation via LogContext", () => {
        it("attaches requestId/traceId/tenantId/userId from LogContext with no explicit metadata", () => {
            const { lines, spy } = captureStdout();
            const logger = new Logger("my-service");

            LogContext.run({ requestId: "req-1", traceId: "trace-1", tenantId: "tenant-1", userId: "user-1" }, () => {
                logger.info("did a thing");
            });
            spy.mockRestore();

            const entry = JSON.parse(lines[0]);
            expect(entry.requestId).toBe("req-1");
            expect(entry.traceId).toBe("trace-1");
            expect(entry.tenantId).toBe("tenant-1");
            expect(entry.userId).toBe("user-1");
        });

        it("logs with no correlation fields at all outside of any LogContext.run() scope", () => {
            const { lines, spy } = captureStdout();
            const logger = new Logger("my-service");

            logger.info("no context here");
            spy.mockRestore();

            const entry = JSON.parse(lines[0]);
            expect(entry.requestId).toBeUndefined();
            expect(entry.traceId).toBeUndefined();
            expect(entry.tenantId).toBeUndefined();
            expect(entry.userId).toBeUndefined();
        });

        it("picks up tenantId/userId set partway through a request (e.g. by a guard running after LogContext.run() starts)", () => {
            const { lines, spy } = captureStdout();
            const logger = new Logger("my-service");

            LogContext.run({ requestId: "req-1" }, () => {
                LogContext.set({ userId: "user-2", tenantId: "tenant-2" });
                logger.info("after auth");
            });
            spy.mockRestore();

            const entry = JSON.parse(lines[0]);
            expect(entry.requestId).toBe("req-1");
            expect(entry.userId).toBe("user-2");
            expect(entry.tenantId).toBe("tenant-2");
        });

        it("explicit metadata on a call wins over LogContext for the same field", () => {
            const { lines, spy } = captureStdout();
            const logger = new Logger("my-service");

            LogContext.run({ requestId: "from-context" }, () => {
                logger.info("overridden", { requestId: "from-call-site" });
            });
            spy.mockRestore();

            const entry = JSON.parse(lines[0]);
            expect(entry.requestId).toBe("from-call-site");
        });

        it("applies to error() too", () => {
            const { lines, spy } = captureStdout();
            const logger = new Logger("my-service");

            LogContext.run({ requestId: "req-err" }, () => {
                logger.error("boom", new Error("failure"));
            });
            spy.mockRestore();

            const entry = JSON.parse(lines[0]);
            expect(entry.requestId).toBe("req-err");
            expect(entry.error.message).toBe("failure");
        });

        it("a request-scoped context doesn't leak into a log call made after that scope ends", () => {
            const { lines, spy } = captureStdout();
            const logger = new Logger("my-service");

            LogContext.run({ requestId: "req-1" }, () => {
                // scope ends here
            });
            logger.info("after the request finished");
            spy.mockRestore();

            const entry = JSON.parse(lines[0]);
            expect(entry.requestId).toBeUndefined();
        });
    });
});
