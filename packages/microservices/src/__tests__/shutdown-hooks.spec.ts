import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Module } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";

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
    return 54000 + Math.floor(Math.random() * 5000);
}

describe("NyalaMicroserviceApplication.enableShutdownHooks()", () => {
    let app: NyalaMicroserviceApplication | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it("registers exactly one SIGTERM and one SIGINT listener, even if called more than once", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const beforeTerm = process.listenerCount("SIGTERM");
        const beforeInt = process.listenerCount("SIGINT");

        app.enableShutdownHooks();
        app.enableShutdownHooks();
        app.enableShutdownHooks();

        expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);
        expect(process.listenerCount("SIGINT")).toBe(beforeInt + 1);

        // process.once() listeners installed by enableShutdownHooks() stay
        // registered until the signal fires — since this test can't safely
        // send a real SIGTERM to the test runner itself, remove them
        // manually so listener counts don't leak into later tests.
        process.removeAllListeners("SIGTERM");
        process.removeAllListeners("SIGINT");
    });

    it("returns itself for chaining", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const result = app.enableShutdownHooks();
        expect(result).toBe(app);

        process.removeAllListeners("SIGTERM");
        process.removeAllListeners("SIGINT");
    });
});
