import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Module } from "@nyalajs/core";
import { MessagePattern, EventPattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";

@Injectable()
class MathService {
    add(a: number, b: number): number {
        return a + b;
    }
}

const receivedEvents: any[] = [];

@Controller()
class MathController {
    constructor(private readonly mathService: MathService) {}

    @MessagePattern("math.add")
    add(@Payload() data: { a: number; b: number }) {
        return this.mathService.add(data.a, data.b);
    }

    @MessagePattern("math.fail")
    fail() {
        throw new Error("boom");
    }
}
// esbuild (vitest's default TS transform) strips decorators without
// emitting "design:paramtypes" — unlike `tsc` with emitDecoratorMetadata,
// which is what actually runs in production builds. Core's own DI tests
// seed this metadata by hand for the same reason (see container.spec.ts).
Reflect.defineMetadata("design:paramtypes", [MathService], MathController);

@Controller()
class NotificationsController {
    @EventPattern("order.created")
    onOrderCreated(@Payload() order: { id: string }) {
        receivedEvents.push(order);
    }
}

@Module({
    providers: [MathService],
    controllers: [MathController, NotificationsController],
})
class AppModule {}

function getFreePort(): number {
    return 41000 + Math.floor(Math.random() * 5000);
}

describe("TCP microservice (e2e)", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
        receivedEvents.length = 0;
    });

    it("resolves a @MessagePattern handler through DI and returns its result", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<number>("math.add", { a: 2, b: 3 });

        expect(result).toBe(5);
    });

    it("propagates a handler error back to the caller as a rejection", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        await expect(client.send("math.fail", {})).rejects.toThrow("boom");
    });

    it("delivers @EventPattern events with no reply expected", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        await client.emit("order.created", { id: "order-1" });

        // Give the event a tick to be delivered and handled.
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(receivedEvents).toEqual([{ id: "order-1" }]);
    });

    it("rejects with a clear error when no handler is registered for the pattern", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        await expect(client.send("unknown.pattern", {})).rejects.toThrow(/No @MessagePattern handler/);
    });
});
