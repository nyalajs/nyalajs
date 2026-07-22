import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Container, getParamMetadata, ParamType } from "@nyalajs/core";
import { RequestContext } from "../context/request-context";
import { ExecutionContext } from "../context/execution-context";
import { RouteRegistry } from "../routing/route-registry";
import { ExceptionHandler, UnprocessableEntityException } from "../errors/exception-handler";
import { Middleware } from "../middleware/middleware.interface";
import { randomUUID } from "crypto";

export interface FastifyAdapterOptions {
    cors?: boolean;
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
}

type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "options" | "head";

export class FastifyAdapter {
    private app: FastifyInstance;
    private routeRegistry: RouteRegistry;
    private exceptionHandler: ExceptionHandler;
    private globalMiddleware: Middleware[] = [];

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
        this.exceptionHandler = new ExceptionHandler();

        this.setupSecurityDefaults(options);
        
        // Register fastify-multipart for File Uploads
        this.app.register(require("@fastify/multipart"), {
            attachFieldsToBody: true, // Buffers files to memory and attaches them to request.body
            limits: {
                fileSize: options.bodyLimit ?? 5 * 1024 * 1024, // Default 5MB
            }
        });

        if (options.swagger !== false) {
            this.setupSwagger();
        }
    }

    /** Register a global middleware instance (runs before every route handler). */
    addMiddleware(middleware: Middleware): void {
        this.globalMiddleware.push(middleware);
    }

    private setupSwagger(): void {
        this.app.register(require("@fastify/swagger"), {
            openapi: {
                info: {
                    title: "NyalaJS API",
                    description: "Auto-generated API documentation",
                    version: "1.0.0",
                },
                servers: [
                    {
                        url: "http://localhost:3000",
                    },
                ],
                components: {
                    securitySchemes: {
                        bearerAuth: {
                            type: "http",
                            scheme: "bearer",
                            bearerFormat: "JWT",
                        },
                    },
                },
            },
        });

        this.app.register(require("@fastify/swagger-ui"), {
            routePrefix: "/docs",
            uiConfig: {
                docExpansion: "list",
                deepLinking: false,
            },
        });
    }

    private setupSecurityDefaults(options: FastifyAdapterOptions): void {
        if (options.compress !== false) {
            // Enable gzip/deflate/brotli compression for all responses
            this.app.register(require("@fastify/compress"), {
                global: true,
                encodings: ["gzip", "deflate", "br"],
                threshold: 1024, // Only compress responses > 1KB
            });
        }

        // Register session support if requested (true by default unless explicitly disabled)
        if (options.session !== false) {
            const secret = process.env.SESSION_SECRET || "a-very-long-and-secure-session-secret-key-that-is-at-least-32-chars";
            this.app.register(require("@fastify/secure-session"), {
                secret,
                salt: "nyala12345678901",
                cookie: {
                    path: "/",
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                }
            });
        }

        if (options.helmet !== false) {
            this.app.register(require("@fastify/helmet"), {
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        scriptSrc: ["'self'"],
                        imgSrc: ["'self'", "data:", "https:"],
                    },
                },
                crossOriginEmbedderPolicy: false,
            });
        }

        if (options.cors !== false) {
            this.app.register(require("@fastify/cors"), {
                origin: true,
                credentials: true,
            });
        }

        if (options.rateLimit !== false) {
            const rateLimitConfig: Record<string, any> = {
                max: Number(process.env.RATE_LIMIT_MAX) || 100,
                timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
                ban: 2, // Ban after 2x max requests
            };

            // Use Redis as the store when REDIS_URL is configured
            const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
            if (redisUrl) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const Redis = require("ioredis");
                    rateLimitConfig.redis = new Redis(
                        process.env.REDIS_URL
                            ? process.env.REDIS_URL
                            : {
                                  host: process.env.REDIS_HOST || "localhost",
                                  port: Number(process.env.REDIS_PORT) || 6379,
                                  password: process.env.REDIS_PASSWORD,
                              }
                    );
                } catch {
                    // ioredis not installed — silently fall back to in-memory
                }
            }

            this.app.register(require("@fastify/rate-limit"), rateLimitConfig);
        }

        if (options.csrf !== false) {
            this.app.register(require("@fastify/cookie")); // Required for CSRF
            this.app.register(require("@fastify/csrf-protection"));
        }
    }

    private buildRouteSchema(route: any): any {
        const schema: any = {};
        
        // Operation metadata
        const operationMeta = Reflect.getMetadata("nyala:swagger:operation", route.controller.prototype[route.handlerName]);
        if (operationMeta) {
            Object.assign(schema, operationMeta);
        }

        // Responses metadata
        const responsesMeta = Reflect.getMetadata("nyala:swagger:responses", route.controller.prototype[route.handlerName]);
        if (responsesMeta && responsesMeta.length > 0) {
            schema.response = {};
            for (const resp of responsesMeta) {
                schema.response[resp.status] = {
                    description: resp.description,
                    type: resp.type || "object",
                };
            }
        }

        // Validation metadata (map Zod to JSON Schema)
        const validationRules = Reflect.getMetadata("nyala:validation", route.controller.prototype, route.handlerName);
        if (validationRules) {
            for (const rule of validationRules) {
                // Simplistic mapping: if it's a zod schema, it might have a description or we just leave it generic.
                // A full integration would use zod-to-json-schema here.
                schema[rule.target] = { type: "object", additionalProperties: true };
            }
        }

        return schema;
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

            const schema = this.buildRouteSchema(route);

            this.app[method](route.path, { schema }, async (request: FastifyRequest, reply: FastifyReply) => {
                await this.handleRequest(request, reply, route);
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
        const startTime = Date.now();

        const context: RequestContext = {
            requestId: randomUUID(),
            traceId: (request.headers["x-trace-id"] as string) ?? randomUUID(),
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

        try {
            // ── Global middleware pipeline ────────────────────────────────────
            await this.runMiddleware(this.globalMiddleware, request, reply);
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
                this.validateRequest(route.controller.prototype, route.handlerName, request);

                // 2. Resolve arguments
                const args = this.resolveHandlerParams(route, request);
                
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

            if (result !== undefined && result !== null) {
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
        } catch (error) {
            await this.exceptionHandler.handle(error as Error, executionContext, reply);
        }
    }

    /**
     * Resolve handler arguments by reading @Body/@Param/@Query/@Headers/@Req/@Res
     * metadata.  Falls back to (body, params, query) positionally if no metadata
     * is declared (backwards-compatible with existing handlers).
     */
    private resolveHandlerParams(route: any, request: FastifyRequest): any[] {
        const paramMeta = getParamMetadata(route.controller.prototype, route.handlerName);

        if (!paramMeta || paramMeta.length === 0) {
            // Legacy fallback: positional body, params, query
            return [(request as any).body, (request as any).params, (request as any).query];
        }

        const sorted = [...paramMeta].sort((a, b) => a.index - b.index);
        const args: any[] = [];

        for (const meta of sorted) {
            switch (meta.type) {
                case ParamType.BODY:
                    args[meta.index] = (request as any).body;
                    break;
                case ParamType.PARAM:
                    args[meta.index] = meta.data
                        ? (request as any).params?.[meta.data]
                        : (request as any).params;
                    break;
                case ParamType.QUERY:
                    args[meta.index] = meta.data
                        ? (request as any).query?.[meta.data]
                        : (request as any).query;
                    break;
                case ParamType.HEADERS:
                    args[meta.index] = meta.data
                        ? request.headers[meta.data.toLowerCase()]
                        : request.headers;
                    break;
                case ParamType.REQUEST:
                    args[meta.index] = request;
                    break;
                case ParamType.RESPONSE:
                    args[meta.index] = (request as any).reply ?? null;
                    break;
                case ParamType.UPLOADED_FILE:
                    if (meta.data && (request as any).body) {
                        const field = (request as any).body[meta.data];
                        // fastify-multipart with attachFieldsToBody sometimes makes it an array
                        args[meta.index] = Array.isArray(field) ? field[0] : field;
                    } else {
                        args[meta.index] = undefined;
                    }
                    break;
                case ParamType.UPLOADED_FILES:
                    if (meta.data && (request as any).body) {
                        const field = (request as any).body[meta.data];
                        args[meta.index] = Array.isArray(field) ? field : [field].filter(Boolean);
                    } else {
                        // Return all file fields from body
                        const files = Object.values((request as any).body || {})
                            .flat()
                            .filter((part: any) => part && part.type === 'file');
                        args[meta.index] = files;
                    }
                    break;
                case ParamType.COOKIE:
                    // Requires @fastify/cookie to be registered
                    args[meta.index] = meta.data
                        ? (request as any).cookies?.[meta.data]
                        : (request as any).cookies ?? {};
                    break;
                case ParamType.IP:
                    args[meta.index] = request.ip;
                    break;
                case ParamType.HOST:
                    args[meta.index] = request.headers?.host ?? null;
                    break;
                default:
                    args[meta.index] = undefined;
            }
        }

        return args;
    }

    /**
     * Reads nyala:validation metadata and executes Zod schemas against the request.
     * Throws UnprocessableEntityException if validation fails.
     */
    private validateRequest(controllerPrototype: any, handlerName: string, request: FastifyRequest): void {
        const rules = Reflect.getMetadata("nyala:validation", controllerPrototype, handlerName) || [];
        
        // Auto-discover Zod schemas from parameter types (DTOs with static schema)
        const paramTypes = Reflect.getMetadata("design:paramtypes", controllerPrototype, handlerName) || [];
        const paramMeta = getParamMetadata(controllerPrototype, handlerName) || [];
        
        for (const meta of paramMeta) {
            const paramType = paramTypes[meta.index];
            if (paramType && paramType.schema && typeof paramType.schema.parse === "function") {
                // If it's a body param, auto-validate body
                if (meta.type === ParamType.BODY && !rules.find((r: any) => r.target === "body")) {
                    rules.push({ target: "body", schema: paramType.schema });
                }
                // If it's a query param, auto-validate query
                else if (meta.type === ParamType.QUERY && !rules.find((r: any) => r.target === "query")) {
                    rules.push({ target: "query", schema: paramType.schema });
                }
            }
        }

        if (!rules || rules.length === 0) return;

        for (const rule of rules) {
            let dataToValidate;
            switch (rule.target) {
                case "body":   dataToValidate = request.body; break;
                case "query":  dataToValidate = request.query; break;
                case "params": dataToValidate = request.params; break;
            }

            try {
                // Execute Zod schema (we use duck-typing to avoid a hard dependency on zod here)
                if (rule.schema && typeof rule.schema.parse === "function") {
                    const parsed = rule.schema.parse(dataToValidate);
                    
                    // Reassign the stripped/transformed data back to the request
                    switch (rule.target) {
                        case "body":   request.body = parsed; break;
                        case "query":  request.query = parsed; break;
                        case "params": request.params = parsed; break;
                    }
                }
            } catch (error: any) {
                // If it's a ZodError, format it
                if (error.issues && Array.isArray(error.issues)) {
                    const details = error.issues.map((err: any) => ({
                        path: err.path.join("."),
                        message: err.message,
                    }));
                    throw new UnprocessableEntityException("Validation failed", details);
                }
                throw error;
            }
        }
    }

    private async runMiddleware(middleware: Middleware[], request: any, reply: any): Promise<void> {
        let index = 0;
        const next = async (): Promise<void> => {
            if (index >= middleware.length) return;
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
