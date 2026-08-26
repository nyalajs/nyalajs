import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Module } from "@nyalajs/core";
import { MessagePattern, EventPattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";

const NATS_SERVERS = process.env.NYALA_TEST_NATS_SERVERS ?? "127.0.0.1:4222";

@Injectable()
class MathService {
    add(a: number, b: number): number {
        return a + b;
    }
}

@Controller()
class MathController {
    constructor(private readonly mathService: MathService) {}

    @MessagePattern("nats.math.add")
    add(@Payload() data: { a: number; b: number }) {
        return this.mathService.add(data.a, data.b);
    }

    @MessagePattern("nats.math.fail")
    fail() {
        throw new Error("boom");
    }
}
Reflect.defineMetadata("design:paramtypes", [MathService], MathController);

const receivedEvents: any[] = [];

@Controller()
class NotificationsController {
    @EventPattern("nats.order.created")
    onOrderCreated(@Payload() order: { id: string }) {
        receivedEvents.push(order);
    }
}

@Module({
    providers: [MathService],
    controllers: [MathController, NotificationsController],
})
class AppModule {}

function uniqueSubjectPrefix(): string {
    return `nyala.test.${Date.now()}.${Math.floor(Math.random() * 1e6)}`;
}

describe("NATS microservice (e2e)", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
        receivedEvents.length = 0;
    });

    it("resolves a @MessagePattern handler through DI and returns its result over NATS request-reply", async () => {
        const subjectPrefix = uniqueSubjectPrefix();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "nats",
            options: { servers: NATS_SERVERS, subjectPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "nats", options: { servers: NATS_SERVERS, subjectPrefix } });

        const result = await client.send<number>("nats.math.add", { a: 4, b: 5 });

        expect(result).toBe(9);
    });

    it("propagates a handler error back to the caller as a rejection", async () => {
        const subjectPrefix = uniqueSubjectPrefix();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "nats",
            options: { servers: NATS_SERVERS, subjectPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "nats", options: { servers: NATS_SERVERS, subjectPrefix } });

        await expect(client.send("nats.math.fail", {})).rejects.toThrow("boom");
    });

    it("delivers @EventPattern events with no reply expected", async () => {
        const subjectPrefix = uniqueSubjectPrefix();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "nats",
            options: { servers: NATS_SERVERS, subjectPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "nats", options: { servers: NATS_SERVERS, subjectPrefix } });

        await client.emit("nats.order.created", { id: "order-99" });

        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(receivedEvents).toEqual([{ id: "order-99" }]);
    });
});
