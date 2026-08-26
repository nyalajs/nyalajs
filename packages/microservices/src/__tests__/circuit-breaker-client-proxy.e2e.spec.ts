import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Module } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { Payload } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { CircuitBreakerClientProxy } from "../resilience/circuit-breaker-client-proxy";
import { CircuitOpenError } from "../resilience/circuit-breaker";

let callCount = 0;

@Injectable()
class FlakyService {
    add(a: number, b: number): number {
        return a + b;
    }
}

@Controller()
class FlakyController {
    constructor(private readonly flaky: FlakyService) {}

    @MessagePattern("always-fails")
    alwaysFails() {
        callCount++;
        throw new Error("downstream is broken");
    }

    @MessagePattern("math.add")
    add(@Payload() data: { a: number; b: number }) {
        callCount++;
        return this.flaky.add(data.a, data.b);
    }
}
Reflect.defineMetadata("design:paramtypes", [FlakyService], FlakyController);

@Module({
    providers: [FlakyService],
    controllers: [FlakyController],
})
class AppModule {}

function getFreePort(): number {
    return 46000 + Math.floor(Math.random() * 5000);
}

describe("CircuitBreakerClientProxy (e2e) — wraps a real TCP ClientProxy against a real server", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: CircuitBreakerClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
        callCount = 0;
    });

    it("trips open after real consecutive failures against a real server, then rejects without reaching it", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const inner = ClientProxyFactory.create({ transport: "tcp", options: { port } });
        client = new CircuitBreakerClientProxy(inner, { failureThreshold: 3, resetTimeoutMs: 10_000 });

        // 3 real failed calls against the real server — the handler genuinely runs and throws each time.
        for (let i = 0; i < 3; i++) {
            await expect(client.send("always-fails", {})).rejects.toThrow("downstream is broken");
        }
        expect(callCount).toBe(3);
        expect(client.getCircuitState()).toBe("open");

        // The circuit is open now — this call must fail immediately with
        // CircuitOpenError, and the real server's handler must NOT run
        // (callCount stays at 3, proving the call never reached it).
        await expect(client.send("always-fails", {})).rejects.toBeInstanceOf(CircuitOpenError);
        expect(callCount).toBe(3);
    });

    it("recovers via half-open once resetTimeoutMs elapses, resuming real calls", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const inner = ClientProxyFactory.create({ transport: "tcp", options: { port } });
        client = new CircuitBreakerClientProxy(inner, { failureThreshold: 1, resetTimeoutMs: 50 });

        await expect(client.send("always-fails", {})).rejects.toThrow("downstream is broken");
        expect(client.getCircuitState()).toBe("open");

        await new Promise((r) => setTimeout(r, 80));
        expect(client.getCircuitState()).toBe("half-open");

        // A real, successful call against the real server closes the circuit.
        const result = await client.send<number>("math.add", { a: 2, b: 3 });
        expect(result).toBe(5);
        expect(client.getCircuitState()).toBe("closed");
    });

    it("isHealthy() reports false while the circuit is open, even though the underlying connection is fine", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const inner = ClientProxyFactory.create({ transport: "tcp", options: { port } });
        client = new CircuitBreakerClientProxy(inner, { failureThreshold: 1 });

        // TcpClientProxy connects lazily on first use, so establish the
        // connection with one real successful call before asserting
        // isHealthy() — checking it pre-connect would just be testing "no
        // socket yet", not "circuit closed, connection fine".
        await client.send("math.add", { a: 1, b: 1 });
        expect(await client.isHealthy()).toBe(true);

        await expect(client.send("always-fails", {})).rejects.toThrow("downstream is broken");
        expect(client.getCircuitState()).toBe("open");

        // The socket itself is still connected — only the circuit being open
        // should make isHealthy() report false.
        expect(await client.isHealthy()).toBe(false);
    });

    it("does not trip on emit() failures from an unrelated pattern before enough real send() failures accumulate", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();

        const inner = ClientProxyFactory.create({ transport: "tcp", options: { port } });
        client = new CircuitBreakerClientProxy(inner, { failureThreshold: 5 });

        // Successful real calls interleaved with failures never reach the threshold consecutively.
        await client.send("math.add", { a: 1, b: 1 });
        await expect(client.send("always-fails", {})).rejects.toThrow();
        await client.send("math.add", { a: 1, b: 1 });
        await expect(client.send("always-fails", {})).rejects.toThrow();

        expect(client.getCircuitState()).toBe("closed");
    });
});
