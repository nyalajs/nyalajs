import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Module, NyalaFactory, NyalaApplication } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { connectMicroservice, startMicroservices, closeMicroservices } from "../hybrid-app";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";

@Injectable()
class GreeterService {
    greet(name: string): string {
        return `Hello, ${name}`;
    }
}

@Controller()
class GreeterController {
    constructor(private readonly greeter: GreeterService) {}

    @MessagePattern("greet")
    greet(@Payload() name: string) {
        return this.greeter.greet(name);
    }
}
Reflect.defineMetadata("design:paramtypes", [GreeterService], GreeterController);

@Module({
    providers: [GreeterService],
    controllers: [GreeterController],
})
class AppModule {}

describe("Hybrid app (HTTP app + attached microservice transport)", () => {
    let app: NyalaApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        if (app) await closeMicroservices(app);
        app = undefined;
        client = undefined;
    });

    it("serves @MessagePattern handlers off the same DI container/module graph as the HTTP app, with no HTTP adapter attached", async () => {
        app = await NyalaFactory.create(AppModule);

        const port = 42999;
        connectMicroservice(app, { transport: "tcp", options: { port } });
        await startMicroservices(app);

        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<string>("greet", "World");

        expect(result).toBe("Hello, World");
    });
});
