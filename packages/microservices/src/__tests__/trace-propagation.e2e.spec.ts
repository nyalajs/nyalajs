import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Inject, Module, LogContext } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { Payload, Ctx } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProvider } from "../decorators/client";
import { ClientProxy } from "../client/client-proxy";
import { ClientProxyFactory } from "../client/client-proxy.factory";

function getFreePort(): number {
    return 50000 + Math.floor(Math.random() * 5000);
}

describe("Trace propagation across services", () => {
    let serviceB: NyalaMicroserviceApplication | undefined;
    let serviceA: NyalaMicroserviceApplication | undefined;
    let entryClient: ClientProxy | undefined;

    afterEach(async () => {
        await entryClient?.close();
        await serviceA?.close();
        await serviceB?.close();
        serviceA = undefined;
        serviceB = undefined;
        entryClient = undefined;
    });

    it("continues the same traceId across an A -> B call chain, while requestId changes per hop", async () => {
        const portB = getFreePort();
        const portA = getFreePort();

        @Controller()
        class BController {
            @MessagePattern("b.leaf")
            leaf(@Payload() msg: string, @Ctx() ctx: any) {
                return { msg, traceId: ctx.trace.traceId, requestId: ctx.trace.requestId };
            }
        }

        @Module({ controllers: [BController] })
        class BModule {}

        serviceB = await MicroserviceFactory.create(BModule, { transport: "tcp", options: { port: portB } });
        await serviceB.listen();

        @Injectable()
        class AService {
            constructor(@Inject("B_CLIENT") private readonly bClient: ClientProxy) {}

            async callB(msg: string) {
                // Both the traceId visible to *this* handler (via LogContext,
                // populated by runWithIncomingTrace from the inbound call) and
                // the traceId the outbound call to B actually carries should match.
                const traceIdSeenLocally = LogContext.get().traceId;
                const bResult = await this.bClient.send<any>("b.leaf", msg);
                return { traceIdSeenLocally, bResult };
            }
        }
        // ClientProxy is an abstract class with no concrete design:paramtypes
        // entry that would resolve meaningfully here — Object stands in as
        // "some type", since @Inject("B_CLIENT") overrides the token anyway.
        Reflect.defineMetadata("design:paramtypes", [Object], AService);

        @Controller()
        class AController {
            constructor(private readonly aService: AService) {}

            @MessagePattern("a.entry")
            entry(@Payload() msg: string) {
                return this.aService.callB(msg);
            }
        }
        // esbuild (vitest's default TS transform) strips decorators without
        // emitting "design:paramtypes" — see the same note in the TCP e2e spec.
        Reflect.defineMetadata("design:paramtypes", [AService], AController);

        @Module({
            providers: [AService, ClientProvider("B_CLIENT", { transport: "tcp", options: { port: portB } })],
            controllers: [AController],
        })
        class AModule {}

        serviceA = await MicroserviceFactory.create(AModule, { transport: "tcp", options: { port: portA } });
        await serviceA.listen();

        entryClient = ClientProxyFactory.create({ transport: "tcp", options: { port: portA } });

        const result = await entryClient.send<any>("a.entry", "hello");

        expect(result.traceIdSeenLocally).toBe(result.bResult.traceId);
        // requestId is per-hop, not shared, so the entry call's own
        // requestId (set by the external client, not the internal A->B one)
        // differs from B's requestId.
        expect(result.bResult.requestId).not.toBe(result.traceIdSeenLocally);
    });
});
