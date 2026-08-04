import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("installProcessErrorHandlers", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        vi.resetModules(); // fresh module instance per test resets the internal `installed` guard
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        vi.restoreAllMocks();
    });

    it("does nothing under NODE_ENV=test — never registers listeners that could kill a test run", async () => {
        process.env.NODE_ENV = "test";
        const before = process.listenerCount("uncaughtException");

        const { installProcessErrorHandlers } = await import("../kernel/crash-handlers");
        installProcessErrorHandlers();

        expect(process.listenerCount("uncaughtException")).toBe(before);
    });

    it("registers uncaughtException/unhandledRejection handlers outside test env", async () => {
        process.env.NODE_ENV = "production";
        const beforeUncaught = process.listenerCount("uncaughtException");
        const beforeRejection = process.listenerCount("unhandledRejection");

        const { installProcessErrorHandlers } = await import("../kernel/crash-handlers");
        installProcessErrorHandlers();

        expect(process.listenerCount("uncaughtException")).toBe(beforeUncaught + 1);
        expect(process.listenerCount("unhandledRejection")).toBe(beforeRejection + 1);

        // Clean up the listeners this test just added so later tests/files aren't affected.
        process.removeAllListeners("uncaughtException");
        process.removeAllListeners("unhandledRejection");
    });

    it("only installs once per process even if called repeatedly", async () => {
        process.env.NODE_ENV = "production";
        const { installProcessErrorHandlers } = await import("../kernel/crash-handlers");

        installProcessErrorHandlers();
        const afterFirst = process.listenerCount("uncaughtException");
        installProcessErrorHandlers();
        installProcessErrorHandlers();

        expect(process.listenerCount("uncaughtException")).toBe(afterFirst);

        process.removeAllListeners("uncaughtException");
        process.removeAllListeners("unhandledRejection");
    });

    it("logs and exits on an uncaught exception", async () => {
        process.env.NODE_ENV = "production";
        const { installProcessErrorHandlers } = await import("../kernel/crash-handlers");
        installProcessErrorHandlers();

        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        process.emit("uncaughtException", new Error("boom"));

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Uncaught exception"), expect.any(Error));
        expect(exitSpy).toHaveBeenCalledWith(1);

        process.removeAllListeners("uncaughtException");
        process.removeAllListeners("unhandledRejection");
    });

    it("logs and exits on an unhandled rejection", async () => {
        process.env.NODE_ENV = "production";
        const { installProcessErrorHandlers } = await import("../kernel/crash-handlers");
        installProcessErrorHandlers();

        const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        process.emit("unhandledRejection", new Error("rejected"), Promise.resolve());

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unhandled promise rejection"), expect.any(Error));
        expect(exitSpy).toHaveBeenCalledWith(1);

        process.removeAllListeners("uncaughtException");
        process.removeAllListeners("unhandledRejection");
    });
});
