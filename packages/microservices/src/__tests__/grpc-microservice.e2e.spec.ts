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

@Controller()
class MathController {
    constructor(private readonly mathService: MathService) {}

    @MessagePattern("grpc.math.add")
    add(@Payload() data: { a: number; b: number }) {
        return this.mathService.add(data.a, data.b);
    }

    @MessagePattern("grpc.math.fail")
    fail() {
        throw new Error("boom");
    }
}
// esbuild (vitest's default TS transform) strips decorators without
// emitting "design:paramtypes" — see the same note in the TCP e2e spec.
Reflect.defineMetadata("design:paramtypes", [MathService], MathController);

const receivedEvents: any[] = [];

@Controller()
class NotificationsController {
    @EventPattern("grpc.order.created")
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
    return 53000 + Math.floor(Math.random() * 5000);
}

describe("gRPC microservice (e2e)", () => {
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
        app = await MicroserviceFactory.create(AppModule, { transport: "grpc", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "grpc", options: { port } });

        const result = await client.send<number>("grpc.math.add", { a: 2, b: 3 });

        expect(result).toBe(5);
    });

    it("propagates a handler error back to the caller as a rejection", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "grpc", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "grpc", options: { port } });

        await expect(client.send("grpc.math.fail", {})).rejects.toThrow("boom");
    });

    it("delivers @EventPattern events with no reply expected", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "grpc", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "grpc", options: { port } });

        await client.emit("grpc.order.created", { id: "order-1" });

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(receivedEvents).toEqual([{ id: "order-1" }]);
    });

    it("rejects with a clear error when no handler is registered for the pattern", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "grpc", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "grpc", options: { port } });

        await expect(client.send("unknown.pattern", {})).rejects.toThrow(/No @MessagePattern handler/);
    });
});
