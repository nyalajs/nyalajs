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
    return 47000 + Math.floor(Math.random() * 5000);
}

describe("TCP client reconnection", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
    });

    it("reconnects with backoff after the server restarts on the same port, and calls succeed again", async () => {
        const port = getFreePort();

        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        client = ClientProxyFactory.create({
            transport: "tcp",
            options: { port, reconnect: { initialDelayMs: 50, maxDelayMs: 200 } },
        });

        const first = await client.send<string>("echo", "before restart");
        expect(first).toBe("before restart");

        // Simulate the server process restarting: close it, then bring a new
        // one up on the same port after a short gap.
        await app.close();
        await new Promise((resolve) => setTimeout(resolve, 100));

        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        // Give the client's reconnect backoff a few cycles to notice the
        // server is back before trying a call through it.
        await new Promise((resolve) => setTimeout(resolve, 500));

        const second = await client.send<string>("echo", "after restart", 5000);
        expect(second).toBe("after restart");
    }, 15000);
});
