import "reflect-metadata";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Injectable, Kernel, Module, TenantContext } from "@nyalajs/core";
import { ObjectType, Field } from "../decorators/object-type";
import { Resolver, Query, Mutation, ResolveField } from "../decorators/resolver";
import { Args, Ctx, Parent } from "../decorators/params";
import { ID, Int } from "../schema/type-mapping";
import { GraphqlServer } from "../execution/graphql-server";
import { mountGraphqlServer } from "../execution/fastify-mount";
import { GraphqlContext } from "../context/graphql-context";
import { createLoader } from "../dataloader/create-loader";

// ---- domain: an in-memory "database" scoped by tenant, to prove tenant
// isolation actually reaches resolvers, not just that TenantContext.set()
// was called somewhere. ----

interface UserRow {
    id: string;
    name: string;
    tenantId: string;
}
interface PostRow {
    id: string;
    title: string;
    authorId: string;
    tenantId: string;
}

const usersTable: UserRow[] = [
    { id: "u1", name: "Alice (tenant-a)", tenantId: "tenant-a" },
    { id: "u2", name: "Bob (tenant-b)", tenantId: "tenant-b" },
];
const postsTable: PostRow[] = [
    { id: "p1", title: "Alice's post", authorId: "u1", tenantId: "tenant-a" },
    { id: "p2", title: "Bob's post", authorId: "u2", tenantId: "tenant-b" },
];

let userLoadCalls: string[][] = [];

@ObjectType()
class User {
    @Field(() => ID)
    id!: string;

    @Field(() => String)
    name!: string;
}

@ObjectType()
class Post {
    @Field(() => ID)
    id!: string;

    @Field(() => String)
    title!: string;

    @Field(() => ID)
    authorId!: string;
}

@Injectable()
@Resolver()
class QueryResolver {
    @Query(() => [User])
    users(@Ctx() ctx: GraphqlContext): UserRow[] {
        // Real tenant scoping — the same fail-closed shape Model uses: no
        // tenant in context means no rows, not "all rows".
        const tenantId = TenantContext.get();
        if (!tenantId) return [];
        return usersTable.filter((u) => u.tenantId === tenantId);
    }

    @Query(() => [Post])
    posts(): PostRow[] {
        const tenantId = TenantContext.get();
        if (!tenantId) return [];
        return postsTable.filter((p) => p.tenantId === tenantId);
    }

    @Query(() => User, { nullable: true })
    userById(@Args("id", () => ID) id: string): UserRow | undefined {
        const tenantId = TenantContext.get();
        return usersTable.find((u) => u.id === id && u.tenantId === tenantId);
    }
}

@Injectable()
@Resolver(() => Post)
class PostFieldResolver {
    @ResolveField(() => User, { nullable: true, name: "author" })
    async author(@Parent() post: PostRow, @Ctx() ctx: GraphqlContext): Promise<UserRow | null> {
        // DataLoader batching — proven by the test asserting batch calls,
        // not individual per-post lookups.
        let loader = ctx.loaders.get(PostFieldResolver);
        if (!loader) {
            loader = createLoader(async (ids: readonly string[]) => {
                userLoadCalls.push([...ids]);
                return ids.map((id) => usersTable.find((u) => u.id === id) ?? null);
            });
            ctx.loaders.set(PostFieldResolver, loader);
        }
        return (await loader.load(post.authorId)) as UserRow | null;
    }
}

@ObjectType()
class CreatePostInput {
    @Field(() => String)
    title!: string;
}

@Injectable()
@Resolver()
class MutationResolver {
    @Mutation(() => Post)
    createPost(@Args("title", () => String) title: string): PostRow {
        const tenantId = TenantContext.get();
        if (!tenantId) throw new Error("no tenant");
        const row: PostRow = { id: `p${postsTable.length + 1}`, title, authorId: "u1", tenantId };
        postsTable.push(row);
        return row;
    }
}

@Module({ providers: [QueryResolver, PostFieldResolver, MutationResolver] })
class GraphqlTestModule {}

// Duck-typed tenant resolver matching @nyalajs/tenancy's TenantResolver contract without depending on the package.
class HeaderTenantResolver {
    async resolve(request: any): Promise<string | undefined> {
        return request?.headers?.["x-tenant-id"];
    }
}

describe("GraphQL layer (e2e, real Fastify + real graphql-yoga + real schema)", () => {
    let app: FastifyInstance;
    let kernel: Kernel;

    beforeEach(async () => {
        userLoadCalls = [];
        kernel = new Kernel();
        await kernel.bootstrap(GraphqlTestModule);

        const server = new GraphqlServer(kernel, {
            resolvers: [QueryResolver, PostFieldResolver, MutationResolver],
            tenantResolvers: [new HeaderTenantResolver()],
            // Tests assert on real error messages below — production apps
            // should leave this masked (the default) to avoid leaking
            // internal error text to API clients.
            maskedErrors: false,
        });

        app = Fastify();
        await mountGraphqlServer(app, server);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    async function gql(query: string, variables?: Record<string, any>, tenantId?: string) {
        const res = await app.inject({
            method: "POST",
            url: "/graphql",
            headers: {
                "content-type": "application/json",
                ...(tenantId ? { "x-tenant-id": tenantId } : {}),
            },
            payload: { query, variables },
        });
        return { status: res.statusCode, body: res.json() };
    }

    it("builds a real executable schema and answers a query end-to-end over HTTP", async () => {
        const { status, body } = await gql(`{ users { id name } }`, undefined, "tenant-a");
        expect(status).toBe(200);
        expect(body.errors).toBeUndefined();
        expect(body.data.users).toEqual([{ id: "u1", name: "Alice (tenant-a)" }]);
    });

    it("enforces real tenant isolation — tenant-b's request never sees tenant-a's rows", async () => {
        const a = await gql(`{ users { id } }`, undefined, "tenant-a");
        const b = await gql(`{ users { id } }`, undefined, "tenant-b");
        expect(a.body.data.users).toEqual([{ id: "u1" }]);
        expect(b.body.data.users).toEqual([{ id: "u2" }]);
    });

    it("fails closed: no tenant header means no rows, not all rows", async () => {
        const { body } = await gql(`{ users { id } }`);
        expect(body.data.users).toEqual([]);
    });

    it("resolves a single argument via @Args(name, type)", async () => {
        const { body } = await gql(`{ userById(id: "u1") { name } }`, undefined, "tenant-a");
        expect(body.data.userById).toEqual({ name: "Alice (tenant-a)" });
    });

    it("runs a real mutation and persists the result", async () => {
        const { body } = await gql(
            `mutation { createPost(title: "New post") { id title authorId } }`,
            undefined,
            "tenant-a"
        );
        expect(body.errors).toBeUndefined();
        expect(body.data.createPost.title).toBe("New post");
        expect(postsTable.some((p) => p.title === "New post")).toBe(true);
    });

    it("batches @ResolveField() relation lookups via DataLoader — one batch call, not N", async () => {
        postsTable.push({ id: "p3", title: "Alice's second post", authorId: "u1", tenantId: "tenant-a" });

        const { body } = await gql(
            `{ posts { title author { name } } }`,
            undefined,
            "tenant-a"
        );

        expect(body.errors).toBeUndefined();
        // Both posts in tenant-a belong to u1 — DataLoader should have
        // collapsed this into ONE batch call for ["u1", "u1"], not two
        // separate loader.load() round-trips resolved independently.
        expect(userLoadCalls.length).toBe(1);
        // DataLoader dedupes identical keys within one batch by default, so
        // two posts sharing the same author collapse to one key here — the
        // real proof of batching is userLoadCalls.length === 1 (one round
        // trip covering both posts), not two independent per-post calls.
        expect(userLoadCalls[0]).toEqual(["u1"]);
        expect(body.data.posts.every((p: any) => p.author.name === "Alice (tenant-a)")).toBe(true);

        postsTable.pop();
    });

    it("a resolver error surfaces as a GraphQL error, not a crashed server", async () => {
        const { status, body } = await gql(`mutation { createPost(title: "x") { id } }`); // no tenant header
        expect(status).toBe(200); // GraphQL errors are still HTTP 200 by spec
        expect(body.errors).toBeDefined();
        expect(body.errors[0].message).toMatch(/no tenant/);
    });

    it("masks resolver error messages by default (maskedErrors unset) — no internal detail leaks to the client", async () => {
        const maskedApp = Fastify();
        const kernel2 = new Kernel();
        await kernel2.bootstrap(GraphqlTestModule);
        const maskedServer = new GraphqlServer(kernel2, {
            resolvers: [QueryResolver, PostFieldResolver, MutationResolver],
            tenantResolvers: [new HeaderTenantResolver()],
            // maskedErrors intentionally omitted — proving the DEFAULT is safe.
        });
        await mountGraphqlServer(maskedApp, maskedServer);
        await maskedApp.ready();

        const res = await maskedApp.inject({
            method: "POST",
            url: "/graphql",
            headers: { "content-type": "application/json" },
            payload: { query: `mutation { createPost(title: "x") { id } }` },
        });
        const body = res.json();

        expect(body.errors).toBeDefined();
        expect(body.errors[0].message).not.toMatch(/no tenant/);
        expect(body.errors[0].message).toBe("Unexpected error.");

        await maskedApp.close();
    });
});
