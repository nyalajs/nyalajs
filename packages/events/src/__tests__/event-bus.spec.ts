import "reflect-metadata";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Container, Injectable } from "@nyalajs/core";
import { EventBus } from "../event-bus";
import { EventHandler } from "../decorators/event-handler";

@Injectable()
class UserListeners {
    received: unknown[] = [];

    @EventHandler("user.created")
    async onUserCreated(payload: unknown) {
        this.received.push(payload);
    }
}

describe("EventBus", () => {
    let container: Container;
    let bus: EventBus;

    beforeEach(() => {
        container = new Container();
        container.register(UserListeners);
        bus = new EventBus(container);
    });

    afterEach(() => {
        delete process.env.REDIS_URL;
        delete process.env.REDIS_HOST;
    });

    it("auto-discovers @EventHandler methods on providers registered in the container", async () => {
        await bus.emitSync("user.created", { id: 1 });

        const listeners = container.resolve(UserListeners);
        expect(listeners.received).toEqual([{ id: 1 }]);
    });

    it("only initializes (scans the container) once, on first emit", async () => {
        const getProvidersSpy = vi.spyOn(container, "getProviders");

        await bus.emitSync("user.created", { a: 1 });
        await bus.emitSync("user.created", { a: 2 });

        expect(getProvidersSpy).toHaveBeenCalledTimes(1);
    });

    it("emit() without Redis configured falls back to local delivery", async () => {
        bus.emit("user.created", { id: 2 });
        await new Promise((resolve) => setImmediate(resolve));

        const listeners = container.resolve(UserListeners);
        expect(listeners.received).toEqual([{ id: 2 }]);
    });

    it("ignores events with no registered handler", async () => {
        await expect(bus.emitSync("nothing.listens", {})).resolves.not.toThrow();
    });
});
