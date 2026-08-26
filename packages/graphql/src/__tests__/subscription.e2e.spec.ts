import "reflect-metadata";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Injectable, Kernel, Module } from "@nyalajs/core";
import { ObjectType, Field } from "../decorators/object-type";
import { Resolver, Query, Subscription } from "../decorators/resolver";
import { Int } from "../schema/type-mapping";
import { GraphqlServer } from "../execution/graphql-server";
import { mountGraphqlServer } from "../execution/fastify-mount";

@ObjectType()
class Tick {
    @Field(() => Int)
    count!: number;
}

async function* countUp(limit: number): AsyncGenerator<{ count: number }> {
    for (let i = 1; i <= limit; i++) {
        yield { count: i };
        await new Promise((resolve) => setTimeout(resolve, 15));
    }
}

@Injectable()
@Resolver()
class TickResolver {
    @Query(() => String)
    ping(): string {
        return "pong";
    }

    @Subscription(() => Tick)
    async *ticks(): AsyncGenerator<{ count: number }> {
        yield* countUp(3);
    }
}

@Module({ providers: [TickResolver] })
class SubscriptionTestModule {}

describe("GraphQL subscriptions (e2e, real Fastify + real graphql-yoga, real SSE stream)", () => {
    let app: FastifyInstance;
    let baseUrl: string;

    beforeEach(async () => {
        const kernel = new Kernel();
        await kernel.bootstrap(SubscriptionTestModule);

        const server = new GraphqlServer(kernel, { resolvers: [TickResolver] });
        app = Fastify();
        await mountGraphqlServer(app, server);
        await app.listen({ port: 0, host: "127.0.0.1" });

        const address = app.server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
        await app.close();
    });

    it("streams real subscription events over SSE through a live Fastify server", async () => {
        const res = await fetch(`${baseUrl}/graphql`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "text/event-stream" },
            body: JSON.stringify({ query: "subscription { ticks { count } }" }),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let full = "";
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const { done, value } = await reader.read();
            if (done) break;
            full += decoder.decode(value);
            if (full.includes('"count":3')) break;
        }
        await reader.cancel().catch(() => undefined);

        expect(full).toContain('"count":1');
        expect(full).toContain('"count":2');
        expect(full).toContain('"count":3');
    });

    it("a plain query still works on the same mounted server (subscriptions don't take over the whole endpoint)", async () => {
        const res = await fetch(`${baseUrl}/graphql`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: "{ ping }" }),
        });
        const body = await res.json();
        expect(body.data.ping).toBe("pong");
    });
});
