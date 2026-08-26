import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Inject, Injectable, Kernel, Module } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { ClientProvider } from "../decorators/client";
import { ClientProxy } from "../client/client-proxy";
import { CircuitBreakerClientProxy } from "../resilience/circuit-breaker-client-proxy";
import { CircuitOpenError } from "../resilience/circuit-breaker";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";

@Controller()
class FlakyServerController {
    @MessagePattern("always-fails")
    alwaysFails() {
        throw new Error("downstream is broken");
    }
}

@Module({ controllers: [FlakyServerController] })
class ServerModule {}

@Injectable()
class OrdersService {
    constructor(@Inject("USERS_SERVICE") public readonly usersClient: ClientProxy) {}
}
Reflect.defineMetadata("design:paramtypes", [Object], OrdersService);

function getFreePort(): number {
    return 47000 + Math.floor(Math.random() * 5000);
}

describe("ClientProvider's circuitBreaker option (e2e) — full DI resolution", () => {
    let server: NyalaMicroserviceApplication | undefined;

    afterEach(async () => {
        await server?.close();
        server = undefined;
    });

    it("resolves a CircuitBreakerClientProxy through the DI container when circuitBreaker: true", async () => {
        const port = getFreePort();
        server = await MicroserviceFactory.create(ServerModule, { transport: "tcp", options: { port } });
        await server.listen();

        @Module({
            providers: [
                OrdersService,
                ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port } }, { circuitBreaker: true }),
            ],
        })
        class AppModule {}

        const kernel = new Kernel();
        await kernel.bootstrap(AppModule);

        const orders = kernel.getContainer().resolve(OrdersService) as OrdersService;
        expect(orders.usersClient).toBeInstanceOf(CircuitBreakerClientProxy);

        // Genuinely trips against the real server through the DI-resolved client.
        const breaker = orders.usersClient as CircuitBreakerClientProxy;
        for (let i = 0; i < 5; i++) {
            await expect(breaker.send("always-fails", {})).rejects.toThrow("downstream is broken");
        }
        expect(breaker.getCircuitState()).toBe("open");
        await expect(breaker.send("always-fails", {})).rejects.toBeInstanceOf(CircuitOpenError);

        await breaker.close();
    });

    it("resolves the plain ClientProxy (no wrapping) when circuitBreaker is omitted", async () => {
        const port = getFreePort();
        server = await MicroserviceFactory.create(ServerModule, { transport: "tcp", options: { port } });
        await server.listen();

        @Module({
            providers: [OrdersService, ClientProvider("USERS_SERVICE", { transport: "tcp", options: { port } })],
        })
        class AppModule {}

        const kernel = new Kernel();
        await kernel.bootstrap(AppModule);

        const orders = kernel.getContainer().resolve(OrdersService) as OrdersService;
        expect(orders.usersClient).not.toBeInstanceOf(CircuitBreakerClientProxy);

        await orders.usersClient.close();
    });

    it("respects custom circuitBreaker options passed as an object", async () => {
        const port = getFreePort();
        server = await MicroserviceFactory.create(ServerModule, { transport: "tcp", options: { port } });
        await server.listen();

        @Module({
            providers: [
                OrdersService,
                ClientProvider(
                    "USERS_SERVICE",
                    { transport: "tcp", options: { port } },
                    { circuitBreaker: { failureThreshold: 2 } }
                ),
            ],
        })
        class AppModule {}

        const kernel = new Kernel();
        await kernel.bootstrap(AppModule);

        const orders = kernel.getContainer().resolve(OrdersService) as OrdersService;
        const breaker = orders.usersClient as CircuitBreakerClientProxy;

        // failureThreshold: 2, not the default 5 — trips after just 2 real failures.
        await expect(breaker.send("always-fails", {})).rejects.toThrow();
        expect(breaker.getCircuitState()).toBe("closed");
        await expect(breaker.send("always-fails", {})).rejects.toThrow();
        expect(breaker.getCircuitState()).toBe("open");

        await breaker.close();
    });
});
