import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Module } from "@nyalajs/core";
import { z } from "zod";
import { MessagePattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { ValidatePayload } from "../decorators/validate-payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";

const CreateUserSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
});

@Controller()
class UsersController {
    @MessagePattern("users.create")
    @ValidatePayload(CreateUserSchema)
    create(@Payload() dto: z.infer<typeof CreateUserSchema>) {
        return { created: true, name: dto.name, age: dto.age };
    }
}

@Module({ controllers: [UsersController] })
class AppModule {}

function getFreePort(): number {
    return 51000 + Math.floor(Math.random() * 5000);
}

describe("@ValidatePayload()", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
    });

    it("passes a valid payload through to the handler", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<any>("users.create", { name: "Ada", age: 30 });

        expect(result).toEqual({ created: true, name: "Ada", age: 30 });
    });

    it("rejects an invalid payload before the handler runs, with field-level details", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        await expect(client.send("users.create", { name: "", age: -5 })).rejects.toThrow(
            /Payload validation failed/
        );
    });
});
