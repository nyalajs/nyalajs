import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Container, Kernel, TenantContext, LogContext, getCatchTypes } from "@nyalajs/core";
import { RequestContext } from "../context/request-context";
import { ExecutionContext } from "../context/execution-context";
import { RouteRegistry } from "../routing/route-registry";
import { ExceptionHandler, ErrorViewRenderer } from "../errors/exception-handler";
import { Middleware } from "../middleware/middleware.interface";
import { isRenderable } from "../response/renderable.interface";
import { isStreamable } from "../response/streamable.interface";
import { randomUUID } from "crypto";
import { setupSwagger } from "./setup/swagger-setup";
import { setupSecurityDefaults } from "./setup/security-setup";
import { setupWebSocketGateways } from "./setup/websocket-setup";
import { buildRouteSchema } from "./setup/route-schema";
import { resolveHandlerParams, validateRequest } from "./setup/param-resolution";
import { sendStream } from "./setup/response-streaming";

export interface FastifyAdapterOptions {
    cors?: boolean;
    /**
     * Origin(s) allowed for cross-origin requests. Defaults to `false` (no
     * cross-origin access) — pass an explicit origin/list to opt in, or
     * `true` to reflect any Origin (only if you understand the tradeoff:
     * combined with `credentials`, this allows any site to make
     * cookie-authenticated requests against this API).
     */
    corsOrigin?: string | string[] | boolean;
    helmet?: boolean;
    csrf?: boolean;
    rateLimit?: boolean;
    /**
     * Enable gzip/deflate/brotli response compression via @fastify/compress.
     * Defaults to true in production, disabled in test environments.
     */
    compress?: boolean;
    bodyLimit?: number;
    requestTimeout?: number;
    swagger?: boolean;
    session?: boolean;
    /**
     * Absolute path to a directory of static assets (CSS, images, ...) to
     * serve via @fastify/static. Not registered at all unless set.
     */
    staticDir?: string;
    /** URL prefix static assets are served under. Defaults to "/public". */
    staticPrefix?: string;
    /**
     * Renders a branded HTML error page for requests that prefer HTML
     * (browser navigation, not JSON API clients). Without one, a small
     * built-in generic page is used instead of a JSON error blob.
     */
    errorView?: ErrorViewRenderer;
    /**
     * Enable @WebSocketGateway()/@SubscribeMessage() support via
     * @fastify/websocket. Off by default — most apps don't need real-time,
     * and the plugin isn't worth registering (and its `ws`/duplexify
     * dependency chain isn't worth requiring) unless a gateway is actually
     * declared. Set true to opt in; gateways are then discovered from the
     * module graph automatically, same as HTTP controllers.
     */
    websocket?: boolean;
}

type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "options" | "head";

export class FastifyAdapter {
    private app: FastifyInstance;
    private routeRegistry: RouteRegistry;
    private exceptionHandler: ExceptionHandler;
    private globalMiddleware: Middleware[] = [];
    private readonly websocketEnabled: boolean;
    // Resolved by registerWebSocketGateways(kernel) — see the nested
    // app.register() callback in the constructor for why this exists.
    private readonly gatewaysReady!: Promise<Kernel>;
    private resolveGatewaysReady!: (kernel: Kernel) => void;

    constructor(
        private readonly container: Container,
        options: FastifyAdapterOptions = {}
    ) {
        this.app = fastify({
            logger: false,
            bodyLimit: options.bodyLimit ?? 1048576,
            connectionTimeout: options.requestTimeout ?? 30000,
        });

        this.routeRegistry = new RouteRegistry();
        this.exceptionHandler = new ExceptionHandler(options.errorView);
        this.websocketEnabled = options.websocket ?? false;
        this.gatewaysReady = new Promise<Kernel>((resolve) => {
            this.resolveGatewaysReady = resolve;
        });

        setupSecurityDefaults(this.app, options);

        // Parse application/x-www-form-urlencoded bodies into request.body —
        // Fastify only parses JSON out of the box, so a plain HTML
        // <form method="POST"> (no JS, no explicit enctype) would otherwise
        // land with an empty/unparsed body. Registered unconditionally, same
        // as multipart below — every app should be able to handle a plain
        // HTML form submission without opting in.
        this.app.register(require("@fastify/formbody"));

        // Register fastify-multipart for File Uploads
        this.app.register(require("@fastify/multipart"), {
            attachFieldsToBody: true, // Buffers files to memory and attaches them to request.body
            limits: {
                fileSize: options.bodyLimit ?? 5 * 1024 * 1024, // Default 5MB
            }
        });

        if (options.swagger !== false) {
            setupSwagger(this.app);
        }

        if (options.staticDir) {
            this.app.register(require("@fastify/static"), {
                root: options.staticDir,
                prefix: options.staticPrefix ?? "/public",
            });
        }

        if (options.websocket) {
            setupWebSocketGateways(this.app, this.gatewaysReady);
        }
    }

    /** Register a global middleware instance (runs before every route handler). */
    addMiddleware(middleware: Middleware): void {
        this.globalMiddleware.push(middleware);
    }

    /**
     * Supplies the Kernel that the nested plugin registered in the
     * constructor (see the `options.websocket` branch above) is waiting on
     * to actually bind @WebSocketGateway()s. Called automatically by
     * NyalaApplication.bindRoutes() (duck-typed — see application.ts) when
     * `websocket: true` was passed to this adapter's constructor; a no-op
     * if it wasn't. Must be called before app.ready()/listen() — Fastify
     * permanently locks route registration once the instance is ready.
     */
    registerWebSocketGateways(kernel: Kernel): void {
        if (!this.websocketEnabled) return;
        this.resolveGatewaysReady(kernel);
    }

    registerRoutes(registry: RouteRegistry): void {
        this.routeRegistry = registry;
        this.bindRegistryRoutes();
    }

    registerResolvedRoutes(routes: any[]): void {
        const registry = new RouteRegistry();
        for (const route of routes) {
            registry.register(route);
        }
        this.registerRoutes(registry);
    }

    private bindRegistryRoutes(): void {
        for (const route of this.routeRegistry.getAll()) {
            const method = route.method.toLowerCase() as HttpMethod;

            // HEAD and OPTIONS are supported by fastify natively
            if (!this.app[method]) {
                continue;
            }

            const schema = buildRouteSchema(route);

            // Deliberately NOT an async handler, and handleRequest()'s
            // promise is deliberately not returned/awaited here — a real
            // Fastify quirk (confirmed via isolated repro, unrelated to
            // this framework's own code) truncates any streamed response
            // sent from inside an async route handler: once that handler
            // has crossed even one microtask tick (any `await`) before
            // calling reply.send() on a stream, Fastify's own
            // handler-return-value machinery races the manual send and
            // ends the response after only the first chunk. A synchronous
            // outer handler with a detached, .catch()-guarded promise
            // sidesteps that machinery entirely, for every route — not just
            // streamed ones — with no change in behavior for ordinary
            // (non-streamed) responses, since handleRequestInScope() already
            // catches everything itself (tryExceptionFilters/ExceptionHandler)
            // and never lets an error reach this .catch() in practice; it's
            // a last-resort net, not the primary error path.
            this.app[method](route.path, { schema }, (request: FastifyRequest, reply: FastifyReply) => {
                this.handleRequest(request, reply, route).catch((error) => {
                    if (!reply.sent) {
                        reply.status(500).send({
                            statusCode: 500,
                            error: "Internal Server Error",
                            message: (error as Error).message,
                        });
                    } else {
                        console.error(
                            JSON.stringify({
                                level: "error",
                                message: "Unhandled error after response was already sent",
                                error: (error as Error).message,
                            })
                        );
                    }
                });
            });

        }

        this.app.setNotFoundHandler((request, reply) => {
            reply.status(404).send({
                statusCode: 404,
                error: "Not Found",
                message: `Route ${request.method}:${request.url} not found`,
                requestId: (request as any).requestId,
                timestamp: new Date().toISOString(),
                path: request.url,
            });
        });
    }

    private async handleRequest(
        request: FastifyRequest,
        reply: FastifyReply,
        route: any
    ): Promise<void> {
        // Run the whole request — middleware, guards, interceptors, handler —
        // inside one AsyncLocalStorage scope so TenantContext.set() (called
        // by tenant-resolving middleware) is visible to everything downstream,
        // including static Model calls with no access to the request object.
        //
        // requestId/traceId are generated once, up front, so they can seed
        // LogContext before any downstream code (middleware, guards, the
        // handler) has a chance to log something — every log line for this
        // request is correlated from the very first one, not just after
        // tenantId/userId get filled in later by TenantMiddleware/AuthGuard.
        const requestId = randomUUID();
        const traceId = (request.headers["x-trace-id"] as string) ?? randomUUID();

        return TenantContext.run(() =>
            LogContext.run({ requestId, traceId }, () =>
                this.handleRequestInScope(request, reply, route, requestId, traceId)
            )
        );
    }

    private async handleRequestInScope(
        request: FastifyRequest,
        reply: FastifyReply,
        route: any,
        requestId: string,
        traceId: string
    ): Promise<void> {
        const startTime = Date.now();

        const context: RequestContext = {
            requestId,
            traceId,
            startedAt: startTime,
            locale: request.headers["accept-language"] as string,
            metadata: new Map(),
        };

        const requestContainer = this.container.createRequestScope();

        requestContainer.register({ provide: "REQUEST_CONTEXT", useValue: context, scope: "singleton" as any });
        requestContainer.register({ provide: "REQUEST", useValue: request, scope: "singleton" as any });
        requestContainer.register({ provide: "RESPONSE", useValue: reply, scope: "singleton" as any });

        const executionContext: ExecutionContext = {
            request,
            response: reply,
            context,
            container: requestContainer,
            route,
        };

        // Guards + handler + response now run as the middleware chain's own
        // terminal continuation (runMiddleware()'s `onComplete`), not as a
        // separate `await` after it — see runMiddleware()'s doc comment for
        // why: a middleware that wraps its own `next()` call in an
        // AsyncLocalStorage scope (ConnectionContext.run(), TenantMiddleware's
        // real use case) needs the actual request handling to run INSIDE
        // that call for the scope to still be active once a DB write
        // happens, not after the whole middleware pipeline has already
        // unwound.
        const runGuardsAndHandler = async (): Promise<void> => {
            // A middleware that sent a reply itself (e.g. rate-limiting,
            // an auth check implemented as middleware rather than a Guard)
            // and THEN still called next() — same defensive check the code
            // here used to run right after runMiddleware() returned, kept
            // for the same reason: sending again would throw/warn "reply
            // already sent".
            if (reply.sent) return;

            // ── Guards ───────────────────────────────────────────────────────
            for (const GuardClass of route.guards ?? []) {
                const guard = requestContainer.resolve(GuardClass) as any;
                const canActivate = await guard.canActivate(executionContext);

                if (!canActivate) {
                    reply.status(403).send({
                        statusCode: 403,
                        error: "Forbidden",
                        message: "Access denied",
                        requestId: context.requestId,
                        timestamp: new Date().toISOString(),
                        path: request.url,
                    });
                    return;
                }
            }

            // ── Handler execution (with interceptors) ────────────────────────
            const executeHandler = async () => {
                const controller = requestContainer.resolve(route.controller) as any;

                // 1. Validate request (using nyala:validation metadata if present)
                validateRequest(route.controller.prototype, route.handlerName, request);

                // 2. Resolve arguments
                const args = resolveHandlerParams(route, request, reply);

                // 3. Execute
                return await controller[route.handlerName](...args);
            };

            let result: any;

            if (route.interceptors && route.interceptors.length > 0) {
                result = await this.executeInterceptors(
                    route.interceptors,
                    executionContext,
                    executeHandler,
                    requestContainer
                );
            } else {
                result = await executeHandler();
            }

            // ── Response ─────────────────────────────────────────────────────
            const duration = Date.now() - startTime;

            // A handler using @Res() to reply directly (e.g. reply.redirect(),
            // reply.send()) already sent the response — sending again here
            // would throw/warn "reply already sent". Nothing left to do.
            if (reply.sent) {
                // still fall through to the request-completed log below
            } else if (isStreamable(result)) {
                // Streamed responses (SseStream or a raw StreamableResponse)
                // finish asynchronously, well after this call returns — the
                // "Request completed" log below would otherwise fire the
                // instant piping *starts*, with a near-zero duration and no
                // real statusCode yet. Log on the stream's actual end/close
                // instead, and stop there so it isn't logged twice.
                sendStream(reply, result, request, context, startTime);
                return;
            } else if (isRenderable(result)) {
                const body = await result.render();
                reply
                    .status(result.statusCode ?? 200)
                    .type(result.contentType ?? "text/html")
                    .send(body);
            } else if (result !== undefined && result !== null) {
                reply.status(200).send(result);
            } else {
                reply.status(204).send();
            }

            console.log(
                JSON.stringify({
                    level: "info",
                    message: "Request completed",
                    requestId: context.requestId,
                    traceId: context.traceId,
                    method: request.method,
                    path: request.url,
                    statusCode: reply.statusCode,
                    duration,
                    timestamp: new Date().toISOString(),
                })
            );
        };

        try {
            await this.runMiddleware(this.globalMiddleware, request, reply, runGuardsAndHandler);
        } catch (error) {
            const handled = await this.tryExceptionFilters(route, error as Error, executionContext, reply, requestContainer);
            if (!handled) {
                await this.exceptionHandler.handle(error as Error, executionContext, reply);
            }
        }
    }

    /**
     * @UseFilters()-declared filters, tried in the order given. The first
     * filter whose @Catch() types match (via `instanceof`, or unconditional
     * if @Catch() was given no arguments) handles the error and short-
     * circuits the framework's default ExceptionHandler. Returns false —
     * meaning "nobody handled it, fall through to ExceptionHandler" — if
     * there are no filters on this route, or none of them match.
     */
    private async tryExceptionFilters(
        route: any,
        error: Error,
        executionContext: ExecutionContext,
        reply: any,
        requestContainer: Container
    ): Promise<boolean> {
        for (const FilterClass of route.filters ?? []) {
            const catchTypes = getCatchTypes(FilterClass);
            const matches = catchTypes.length === 0 || catchTypes.some((type) => error instanceof type);

            if (matches) {
                const filter = requestContainer.resolve(FilterClass) as any;
                await filter.catch(error, executionContext, reply);
                return true;
            }
        }

        return false;
    }

    /**
     * Runs `middleware` in order, then `onComplete` as the TRUE end of the
     * chain — the last middleware's own `await next()` call resolves only
     * once `onComplete` itself has finished, not before it.
     *
     * This matters far beyond "middleware runs before the handler": any
     * middleware using AsyncLocalStorage-based context propagation around
     * its own `next()` call (@nyalajs/tenancy's TenantMiddleware wrapping
     * `ConnectionContext.run(dedicatedDb, next)` is the real, concrete
     * case) needs the ACTUAL route handler to execute INSIDE that `next()`
     * call for the context to still be active when the handler runs.
     * Previously, `next()` for the last middleware just `return`ed
     * immediately (nothing left in the middleware array), so
     * `runMiddleware()` as a whole resolved BEFORE the guards/handler even
     * started — meaning they always ran completely outside any
     * AsyncLocalStorage scope a middleware had entered. Reproduced against
     * a real request: a tenant migrated to a dedicated database via
     * TenantMigrationService kept having its WRITES land on the shared
     * database anyway, because Model.connection() saw ConnectionContext as
     * empty by the time the write actually happened — the request handler
     * was, in effect, never really "inside" TenantMiddleware's `next()`
     * call at all.
     */
    private async runMiddleware(middleware: Middleware[], request: any, reply: any, onComplete?: () => Promise<void>): Promise<void> {
        let index = 0;
        const next = async (): Promise<void> => {
            if (index >= middleware.length) {
                if (onComplete) await onComplete();
                return;
            }
            const mw = middleware[index++];
            await mw.use(request, reply, next);
        };
        await next();
    }

    private async executeInterceptors(
        interceptors: any[],
        ctx: ExecutionContext,
        handler: () => Promise<any>,
        container: Container
    ): Promise<any> {
        let index = 0;

        const next = async (): Promise<any> => {
            if (index >= interceptors.length) {
                return await handler();
            }

            const InterceptorClass = interceptors[index++];
            const interceptor = container.resolve(InterceptorClass) as any;
            return await interceptor.intercept(ctx, next);
        };

        return await next();
    }

    async listen(port: number, host: string = "0.0.0.0"): Promise<void> {
        await this.app.listen({ port, host });
        console.log(`🚀 Nyala application listening on http://${host}:${port}`);
    }

    async close(): Promise<void> {
        await this.app.close();
    }

    getInstance(): FastifyInstance {
        return this.app;
    }
}
