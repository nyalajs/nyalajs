import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "../event-emitter";

describe("EventEmitter", () => {
    it("invokes registered listeners with the emitted payload", async () => {
        const emitter = new EventEmitter();
        const handler = vi.fn();

        emitter.on("user.created", handler);
        emitter.emit("user.created", { id: 1 });

        await new Promise((resolve) => setImmediate(resolve)); // let the fire-and-forget microtask run
        expect(handler).toHaveBeenCalledWith({ id: 1 });
    });

    it("invokes multiple listeners for the same event", async () => {
        const emitter = new EventEmitter();
        const a = vi.fn();
        const b = vi.fn();

        emitter.on("x", a);
        emitter.on("x", b);
        await emitter.emitSync("x", "payload");

        expect(a).toHaveBeenCalledWith("payload");
        expect(b).toHaveBeenCalledWith("payload");
    });

    it("off() unsubscribes a listener", async () => {
        const emitter = new EventEmitter();
        const handler = vi.fn();

        emitter.on("x", handler);
        emitter.off("x", handler);
        await emitter.emitSync("x", "payload");

        expect(handler).not.toHaveBeenCalled();
    });

    it("emitSync() waits for all async listeners to complete", async () => {
        const emitter = new EventEmitter();
        const order: string[] = [];

        emitter.on("x", async () => {
            await new Promise((r) => setTimeout(r, 10));
            order.push("slow");
        });
        emitter.on("x", () => {
            order.push("fast");
        });

        await emitter.emitSync("x", undefined);
        order.push("after");

        expect(order).toEqual(["fast", "slow", "after"]);
    });

    it("emit() does not throw when a listener rejects — the error is logged instead", async () => {
        const emitter = new EventEmitter();
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        emitter.on("x", async () => {
            throw new Error("listener failure");
        });

        expect(() => emitter.emit("x", undefined)).not.toThrow();
        await new Promise((resolve) => setImmediate(resolve));

        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("emit() on an event with no listeners is a no-op", () => {
        const emitter = new EventEmitter();
        expect(() => emitter.emit("nothing.listens", {})).not.toThrow();
    });
});
