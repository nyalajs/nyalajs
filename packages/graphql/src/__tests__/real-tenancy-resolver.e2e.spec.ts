import "reflect-metadata";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Injectable, Kernel, Module } from "@nyalajs/core";
import { HeaderTenantResolver } from "@nyalajs/tenancy";
import { ObjectType, Field } from "../decorators/object-type";
import { Resolver, Query } from "../decorators/resolver";
import { Ctx } from "../decorators/params";
import { GraphqlServer } from "../execution/graphql-server";
import { mountGraphqlServer } from "../execution/fastify-mount";
import { GraphqlContext } from "../context/graphql-context";

// Proves GraphqlServer's `tenantResolvers` option works with the REAL
// @nyalajs/tenancy resolvers (not a duck-typed test double) — the same
// HeaderTenantResolver every HTTP app's TenantMiddleware uses.

@ObjectType()
class Whoami {
    @Field(() => String, { nullable: true })
    tenantId!: string | null;
}

@Injectable()
@Resolver()
class WhoamiResolver {
    @Query(() => Whoami)
    whoami(@Ctx() ctx: GraphqlContext): { tenantId: string | null } {
        return { tenantId: ctx.tenantId ?? null };
    }
}

@Module({ providers: [WhoamiResolver] })
class TenancyTestModule {}

describe("GraphqlServer + real @nyalajs/tenancy HeaderTenantResolver (e2e)", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        const kernel = new Kernel();
        await kernel.bootstrap(TenancyTestModule);
        const server = new GraphqlServer(kernel, {
            resolvers: [WhoamiResolver],
            tenantResolvers: [new HeaderTenantResolver()],
        });
        app = Fastify();
        await mountGraphqlServer(app, server);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it("resolves the tenant from x-tenant-id using the real HeaderTenantResolver", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/graphql",
            headers: { "content-type": "application/json", "x-tenant-id": "acme-corp" },
            payload: { query: "{ whoami { tenantId } }" },
        });
        expect(res.json().data.whoami.tenantId).toBe("acme-corp");
    });

    it("the same resolver refuses a spoofed tenant header when Authorization is present (its own documented safety rule)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/graphql",
            headers: {
                "content-type": "application/json",
                "x-tenant-id": "acme-corp",
                authorization: "Bearer some-jwt",
            },
            payload: { query: "{ whoami { tenantId } }" },
        });
        expect(res.json().data.whoami.tenantId).toBeNull();
    });
});
