import { randomUUID } from "node:crypto";
import { Kernel, Type, TenantContext, LogContext } from "@nyalajs/core";
import { GraphQLSchema } from "graphql";
import { GraphqlSchemaBuilder, BuildSchemaOptions } from "../schema/schema-builder";
import { GraphqlContext } from "../context/graphql-context";

export interface TenantResolverLike {
    resolve(request: any): Promise<string | undefined>;
}

export interface GraphqlServerOptions extends BuildSchemaOptions {
    /** URL the GraphQL endpoint (and GraphiQL, in dev) is mounted at. @default "/graphql" */
    graphqlEndpoint?: string;
    /**
     * Tenant resolvers tried in order, same contract as @nyalajs/tenancy's
     * TenantResolver (duck-typed here rather than importing the package
     * directly, since @nyalajs/tenancy is an optional peer — most GraphQL
     * APIs aren't multi-tenant). First one to resolve a tenant id wins.
     */
    tenantResolvers?: TenantResolverLike[];
    /** Extend the per-request context with request-specific values (auth user, etc.) beyond the base {request, tenantId, container, loaders}. */
    context?: (base: GraphqlContext) => Promise<Record<string, any>> | Record<string, any>;
    /** Passed through to graphql-yoga's own `graphiql` option — enable/disable the in-browser IDE. @default true in development, false otherwise, matching graphql-yoga's own default. */
    graphiql?: boolean;
    /**
     * Passed through to graphql-yoga's own `maskedErrors` option. Left
     * unset (graphql-yoga's own default: masked, replacing an unexpected
     * resolver error's message with "Unexpected error." in the response)
     * unless explicitly overridden — this matters because GraphqlExceptionFilter
     * and thrown Error messages can otherwise leak internal details (stack
     * traces, database error text) straight to API clients. Set to `false`
     * only for local development, or if every error you throw from a
     * resolver is already something you want a client to see verbatim.
     */
    maskedErrors?: boolean;
}

/**
 * Builds the schema from @Resolver()-decorated classes and wraps it in a
 * graphql-yoga instance, wired into the same TenantContext/LogContext/DI
 * pipeline as @nyalajs/http's FastifyAdapter. Framework-agnostic about HOW
 * it's mounted — see mountGraphqlServer() (fastify-mount.ts) for the actual
 * Fastify route registration, kept separate so building a schema doesn't
 * force a Fastify dependency on code that only wants the GraphQLSchema
 * (e.g. to print it, or run it in tests without any HTTP layer at all).
 */
export class GraphqlServer {
    public readonly schema: GraphQLSchema;

    constructor(
        private readonly kernel: Kernel,
        public readonly options: GraphqlServerOptions
    ) {
        this.schema = new GraphqlSchemaBuilder(kernel).build(options);
    }

    get graphqlEndpoint(): string {
        return this.options.graphqlEndpoint ?? "/graphql";
    }

    /**
     * Builds one request's GraphqlContext and runs `fn` inside a fresh
     * TenantContext.run()/LogContext.run() scope — mirroring
     * FastifyAdapter.handleRequest's wrapping exactly, so TenantContext.get()
     * inside a resolver (or inside a service a resolver calls into, e.g. a
     * Model's tenant scoping) behaves identically whether that service was
     * reached via REST or GraphQL.
     */
    async runInScope<T>(request: any, fn: (ctx: GraphqlContext) => Promise<T>): Promise<T> {
        const requestId = randomUUID();
        const traceId = (request?.headers?.["x-trace-id"] as string) ?? randomUUID();

        return TenantContext.run(() =>
            LogContext.run({ requestId, traceId }, async () => {
                const tenantId = await this.resolveTenant(request);
                if (tenantId) {
                    TenantContext.set(tenantId);
                    LogContext.set({ tenantId });
                }

                const base: GraphqlContext = {
                    request,
                    tenantId,
                    container: this.kernel.getContainer(),
                    loaders: new Map(),
                };

                const extra = this.options.context ? await this.options.context(base) : {};
                return fn({ ...base, ...extra });
            })
        );
    }

    private async resolveTenant(request: any): Promise<string | undefined> {
        for (const resolver of this.options.tenantResolvers ?? []) {
            const tenantId = await resolver.resolve(request);
            if (tenantId) return tenantId;
        }
        return undefined;
    }
}
