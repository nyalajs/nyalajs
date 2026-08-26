import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Module } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";
import { microserviceHealthIndicator } from "../health/microservice-health-indicator";

@Controller()
class PingController {
    @MessagePattern("ping")
    ping() {
        return "pong";
    }
}

@Module({ controllers: [PingController] })
class AppModule {}

function getFreePort(): number {
    return 52000 + Math.floor(Math.random() * 5000);
}

describe("microserviceHealthIndicator", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
    });

    it("reports up while the server is listening", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const indicator = microserviceHealthIndicator("ping-service", app);
        const result = await indicator.check();

        expect(result).toEqual({ status: "up" });
    });

    it("reports down after the server is closed", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        await app.close();

        const indicator = microserviceHealthIndicator("ping-service", app);
        const result = await indicator.check();

        expect(result.status).toBe("down");
    });

    it("reports client connectivity too", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });
        await client.send("ping", {});

        const indicator = microserviceHealthIndicator("ping-client", client);
        const result = await indicator.check();

        expect(result).toEqual({ status: "up" });
    });
});
