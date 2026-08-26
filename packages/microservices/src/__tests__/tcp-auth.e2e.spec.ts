import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Module } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";

@Controller()
class EchoController {
    @MessagePattern("echo")
    echo(@Payload() msg: string) {
        return msg;
    }
}

@Module({ controllers: [EchoController] })
class AppModule {}

function getFreePort(): number {
    return 46000 + Math.floor(Math.random() * 5000);
}

describe("TCP transport auth", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
    });

    it("accepts a client presenting the correct auth token", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "tcp",
            options: { port, authToken: "s3cret" },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "tcp",
            options: { port, authToken: "s3cret" },
        });

        const result = await client.send<string>("echo", "hi");
        expect(result).toBe("hi");
    });

    it("drops a connection presenting the wrong auth token", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "tcp",
            options: { port, authToken: "s3cret" },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "tcp",
            options: { port, authToken: "wrong-token", reconnect: { maxRetries: 0 } },
        });

        await expect(client.send("echo", "hi", 1000)).rejects.toThrow();
    });

    it("drops a connection sending no auth token at all when the server requires one", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, {
            transport: "tcp",
            options: { port, authToken: "s3cret" },
        });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "tcp",
            options: { port, reconnect: { maxRetries: 0 } },
        });

        await expect(client.send("echo", "hi", 1000)).rejects.toThrow();
    });
});
