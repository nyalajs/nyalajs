import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Module } from "@nyalajs/core";
import { MessagePattern, EventPattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";

/**
 * Real, unmocked exercise of the Redis transport end to end against a live
 * Redis server.
 *
 * Requires a live Redis server. Skipped unless NYALA_TEST_REDIS_PORT is set
 * (CI has no Redis service configured for this suite, so it never runs
 * there) — run locally with e.g.:
 *   docker run --rm -p 6399:6379 redis:7-alpine
 *   NYALA_TEST_REDIS_PORT=6399 npx vitest run redis-microservice.e2e
 */
const NYALA_TEST_REDIS_PORT = process.env.NYALA_TEST_REDIS_PORT;
const REDIS_PORT = Number(NYALA_TEST_REDIS_PORT);

@Injectable()
class MathService {
    add(a: number, b: number): number {
        return a + b;
    }
}

@Controller()
class MathController {
    constructor(private readonly mathService: MathService) {}

    @MessagePattern("redis.math.add")
    add(@Payload() data: { a: number; b: number }) {
        return this.mathService.add(data.a, data.b);
    }

    @MessagePattern("redis.math.fail")
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
    @EventPattern("redis.order.created")
    onOrderCreated(@Payload() order: { id: string }) {
        receivedEvents.push(order);
    }
}

@Module({
    providers: [MathService],
    controllers: [MathController, NotificationsController],
})
class AppModule {}

function uniqueChannelPrefix(): string {
    return `nyala:test:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
}

describe.skipIf(!NYALA_TEST_REDIS_PORT)("Redis microservice (e2e)", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
        receivedEvents.length = 0;
    });

    it("resolves a @MessagePattern handler through DI and returns its result over Redis pub/sub", async () => {
        const channelPrefix = uniqueChannelPrefix();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "redis",
            options: { host: "127.0.0.1", port: REDIS_PORT, channelPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "redis",
            options: { host: "127.0.0.1", port: REDIS_PORT, channelPrefix },
        });

        const result = await client.send<number>("redis.math.add", { a: 4, b: 5 });

        expect(result).toBe(9);
    });

    it("propagates a handler error back to the caller as a rejection", async () => {
        const channelPrefix = uniqueChannelPrefix();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "redis",
            options: { host: "127.0.0.1", port: REDIS_PORT, channelPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "redis",
            options: { host: "127.0.0.1", port: REDIS_PORT, channelPrefix },
        });

        await expect(client.send("redis.math.fail", {})).rejects.toThrow("boom");
    });

    it("delivers @EventPattern events with no reply expected", async () => {
        const channelPrefix = uniqueChannelPrefix();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "redis",
            options: { host: "127.0.0.1", port: REDIS_PORT, channelPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "redis",
            options: { host: "127.0.0.1", port: REDIS_PORT, channelPrefix },
        });

        await client.emit("redis.order.created", { id: "order-42" });

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(receivedEvents).toEqual([{ id: "order-42" }]);
    });
});
