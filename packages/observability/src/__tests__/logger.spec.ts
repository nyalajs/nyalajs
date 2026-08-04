import { describe, it, expect, vi, afterEach } from "vitest";
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
});
