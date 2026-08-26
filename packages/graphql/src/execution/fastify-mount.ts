import { GraphqlServer } from "./graphql-server";

/**
 * Mounts a GraphqlServer onto an existing Fastify instance (e.g.
 * `httpAdapter.getInstance()`) at `server.graphqlEndpoint`. Uses
 * graphql-yoga's `handleNodeRequestAndResponse()` directly rather than a
 * generic body-parsing route — this hands yoga the raw Node req/res so it
 * can negotiate multipart file uploads, SSE (subscriptions), and GraphiQL's
 * HTML landing page itself, none of which fit a plain JSON route handler.
 *
 * graphql-yoga is an optional peer dependency of @nyalajs/graphql — only
 * required if you call this function (or otherwise construct a `createYoga`
 * instance yourself).
 *
 * @example
 * ```ts
 * import { FastifyAdapter } from "@nyalajs/http";
 * import { GraphqlServer, mountGraphqlServer } from "@nyalajs/graphql";
 *
 * const server = new GraphqlServer(kernel, { resolvers: [UserResolver] });
 * await mountGraphqlServer(httpAdapter.getInstance(), server);
 * ```
 */
export async function mountGraphqlServer(fastifyInstance: any, server: GraphqlServer): Promise<void> {
    let createYoga: any;
    try {
        // @ts-ignore — optional peer dep
        ({ createYoga } = await import("graphql-yoga"));
    } catch {
        throw new Error(
            '[nyala/graphql] mountGraphqlServer() requires the optional peer dependency "graphql-yoga". ' +
            "Run: npm install graphql-yoga"
        );
    }

    const graphqlEndpoint = server.graphqlEndpoint;

    const yoga = createYoga({
        schema: server.schema,
        graphqlEndpoint,
        graphiql: server.options.graphiql,
        context: (initialContext: any) => initialContext.nyalaContext,
        ...(server.options.maskedErrors !== undefined ? { maskedErrors: server.options.maskedErrors } : {}),
    });

    fastifyInstance.route({
        url: graphqlEndpoint,
        method: ["GET", "POST", "OPTIONS"],
        handler: async (request: any, reply: any) => {
            await server.runInScope(request, async (nyalaContext) => {
                // Deliberately request/reply (Fastify's wrapper objects), NOT
                // request.raw/reply.raw: Fastify has already started consuming
                // the raw Node request stream by the time this handler runs,
                // so handing yoga the raw objects makes it wait forever on a
                // body that's already been read elsewhere. Fastify's wrappers
                // expose what @whatwg-node/server actually needs (a readable
                // body it hasn't already drained) — confirmed against a real
                // Fastify instance; passing .raw hangs the request indefinitely.
                const response = await yoga.handleNodeRequestAndResponse(request, reply, {
                    req: request,
                    reply,
                    nyalaContext,
                });
                response.headers.forEach((value: string, key: string) => reply.header(key, value));
                reply.status(response.status);
                reply.send(response.body);
            });
            return reply;
        },
    });
}
