import { describe, it, expect, vi } from "vitest";
import { AuditLogger, AuditStorage } from "../audit-logger";
import { AuditEvent } from "../audit-event";

function baseEvent(): Omit<AuditEvent, "id" | "timestamp"> {
    return {
        actorId: "user-1",
        action: "create",
        resourceType: "widgets",
        resourceId: "42",
        ip: "127.0.0.1",
        userAgent: "vitest",
        requestId: "req-1",
        traceId: "trace-1",
        metadata: {},
    };
}

describe("AuditLogger", () => {
    it("logs a structured JSON line to the console with a generated id and timestamp", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const logger = new AuditLogger();

        await logger.log(baseEvent());

        expect(logSpy).toHaveBeenCalledOnce();
        const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(entry.level).toBe("audit");
        expect(entry.actorId).toBe("user-1");
        expect(entry.action).toBe("create");
        expect(typeof entry.id).toBe("string");
        expect(entry.id.length).toBeGreaterThan(0);
        expect(typeof entry.timestamp).toBe("string");
        logSpy.mockRestore();
    });

    it("does not touch storage when none is configured", async () => {
        const logger = new AuditLogger();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        await expect(logger.log(baseEvent())).resolves.not.toThrow();
        vi.restoreAllMocks();
    });

    it("persists to storage when configured, including the generated id/timestamp", async () => {
        const storage: AuditStorage = { save: vi.fn().mockResolvedValue(undefined), query: vi.fn() };
        const logger = new AuditLogger(storage);
        vi.spyOn(console, "log").mockImplementation(() => undefined);

        await logger.log(baseEvent());

        expect(storage.save).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: "user-1", id: expect.any(String), timestamp: expect.any(Date) })
        );
        vi.restoreAllMocks();
    });

    it("query() throws when no storage is configured", async () => {
        const logger = new AuditLogger();
        await expect(logger.query({})).rejects.toThrow(/not configured/);
    });

    it("query() delegates to storage when configured", async () => {
        const results = [{ ...baseEvent(), id: "1", timestamp: new Date() }] as AuditEvent[];
        const storage: AuditStorage = { save: vi.fn(), query: vi.fn().mockResolvedValue(results) };
        const logger = new AuditLogger(storage);

        const found = await logger.query({ action: "create" });

        expect(storage.query).toHaveBeenCalledWith({ action: "create" });
        expect(found).toBe(results);
    });
});
