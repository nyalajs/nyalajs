import { describe, it, expect } from "vitest";
import { LogContext } from "../context/log-context";

describe("LogContext", () => {
    it("returns an empty object outside of any run() scope", () => {
        expect(LogContext.get()).toEqual({});
    });

    it("returns the store passed to run()", () => {
        LogContext.run({ requestId: "req-1", traceId: "trace-1" }, () => {
            expect(LogContext.get()).toEqual({ requestId: "req-1", traceId: "trace-1" });
        });
    });

    it("set() patches fields onto the current scope's store", () => {
        LogContext.run({ requestId: "req-1" }, () => {
            LogContext.set({ tenantId: "tenant-1" });
            expect(LogContext.get()).toEqual({ requestId: "req-1", tenantId: "tenant-1" });
        });
    });

    it("set() outside of a run() scope is a safe no-op", () => {
        expect(() => LogContext.set({ userId: "u1" })).not.toThrow();
        expect(LogContext.get()).toEqual({});
    });

    it("nested run() scopes don't leak into each other after the inner one returns", () => {
        LogContext.run({ requestId: "outer" }, () => {
            LogContext.run({ requestId: "inner" }, () => {
                expect(LogContext.get().requestId).toBe("inner");
            });
            expect(LogContext.get().requestId).toBe("outer");
        });
    });

    it("run() returns the callback's return value", () => {
        const result = LogContext.run({ requestId: "req-1" }, () => 42);
        expect(result).toBe(42);
    });

    it("propagates across an await inside run()", async () => {
        await LogContext.run({ requestId: "async-req" }, async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(LogContext.get().requestId).toBe("async-req");
        });
    });
});
