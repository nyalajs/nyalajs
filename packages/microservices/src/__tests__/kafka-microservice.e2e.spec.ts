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
 * Real, unmocked exercise of the Kafka transport end to end against a live
 * Kafka broker.
 *
 * Requires a live Kafka broker. Skipped unless NYALA_TEST_KAFKA_BROKERS is
 * set (CI has no Kafka service configured for this suite, so it never runs
 * there) — run locally with e.g.:
 *   docker run --rm -p 9092:9092 apache/kafka:3.7.0
 *   NYALA_TEST_KAFKA_BROKERS="127.0.0.1:9092" npx vitest run kafka-microservice.e2e
 */
const NYALA_TEST_KAFKA_BROKERS = process.env.NYALA_TEST_KAFKA_BROKERS;
const KAFKA_BROKERS = (NYALA_TEST_KAFKA_BROKERS ?? "").split(",");

@Injectable()
class MathService {
    add(a: number, b: number): number {
        return a + b;
    }
}

@Controller()
class MathController {
    constructor(private readonly mathService: MathService) {}

    @MessagePattern("kafka.math.add")
    add(@Payload() data: { a: number; b: number }) {
        return this.mathService.add(data.a, data.b);
    }

    @MessagePattern("kafka.math.fail")
    fail() {
        throw new Error("boom");
    }
}
Reflect.defineMetadata("design:paramtypes", [MathService], MathController);

const receivedEvents: any[] = [];

@Controller()
class NotificationsController {
    @EventPattern("kafka.order.created")
    onOrderCreated(@Payload() order: { id: string }) {
        receivedEvents.push(order);
    }
}

@Module({
    providers: [MathService],
    controllers: [MathController, NotificationsController],
})
class AppModule {}

function uniqueId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

describe.skipIf(!NYALA_TEST_KAFKA_BROKERS)("Kafka microservice (e2e)", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
        receivedEvents.length = 0;
    }, 20000);

    it("resolves a @MessagePattern handler through DI and returns its result over a Kafka reply topic", async () => {
        const id = uniqueId();
        const topicPrefix = `nyala.test.${id}`;
        const clientId = `nyala-test-${id}`;

        app = await MicroserviceFactory.create(AppModule, {
            transport: "kafka",
            options: { clientId: `${clientId}-server`, brokers: KAFKA_BROKERS, topicPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "kafka",
            options: { clientId: `${clientId}-client`, brokers: KAFKA_BROKERS, topicPrefix },
        });

        const result = await client.send<number>("kafka.math.add", { a: 6, b: 7 }, 15000);

        expect(result).toBe(13);
    }, 30000);

    it("propagates a handler error back to the caller as a rejection", async () => {
        const id = uniqueId();
        const topicPrefix = `nyala.test.${id}`;
        const clientId = `nyala-test-${id}`;

        app = await MicroserviceFactory.create(AppModule, {
            transport: "kafka",
            options: { clientId: `${clientId}-server`, brokers: KAFKA_BROKERS, topicPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "kafka",
            options: { clientId: `${clientId}-client`, brokers: KAFKA_BROKERS, topicPrefix },
        });

        await expect(client.send("kafka.math.fail", {}, 15000)).rejects.toThrow("boom");
    }, 30000);

    it("delivers @EventPattern events with no reply expected", async () => {
        const id = uniqueId();
        const topicPrefix = `nyala.test.${id}`;
        const clientId = `nyala-test-${id}`;

        app = await MicroserviceFactory.create(AppModule, {
            transport: "kafka",
            options: { clientId: `${clientId}-server`, brokers: KAFKA_BROKERS, topicPrefix },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "kafka",
            options: { clientId: `${clientId}-client`, brokers: KAFKA_BROKERS, topicPrefix },
        });

        await client.emit("kafka.order.created", { id: "order-77" });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        expect(receivedEvents).toEqual([{ id: "order-77" }]);
    }, 30000);
});
