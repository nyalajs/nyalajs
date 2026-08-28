import { Type } from "../types/common";
import { Kernel } from "./kernel";
import { PluginManager } from "../plugins/plugin.manager";
import { NyalaPlugin } from "../plugins/plugin.interface";
import { RouteResolver } from "../routing/route-resolver";
import { MetadataScanner } from "../metadata/metadata-scanner";
import { installProcessErrorHandlers } from "./crash-handlers";

export interface NyalaOptions {
    cors?: boolean;
    helmet?: boolean;
    rateLimit?: boolean;
    bodyLimit?: number;
    requestTimeout?: number;
}

export class NyalaApplication {
    private httpAdapter?: any;
    private pluginManager = new PluginManager();

    constructor(
        private readonly kernel: Kernel,
        private readonly options: NyalaOptions = {}
    ) { }

    setHttpAdapter(adapter: any): void {
        this.httpAdapter = adapter;
    }

    /**
     * Register one or more plugins. Plugins are booted in the order they are
     * registered, during `NyalaFactory.create()` before the HTTP server starts.
     *
     * @example
     *   const app = await NyalaFactory.create(AppModule);
     *   app.plugin(new StripePlugin(), new AnalyticsPlugin());
     *   await app.listen(3000);
     */
    plugin(...plugins: NyalaPlugin[]): this {
        this.pluginManager.register(...plugins);
        return this;
    }

    /**
     * Execute the plugin boot sequence. Called internally by NyalaFactory.
     */
    async bootPlugins(): Promise<void> {
        await this.pluginManager.boot(this);
    }

    /**
     * Register a global middleware instance. The middleware runs before every
     * route handler in the order `use()` is called.
     *
     * @example
     *   const app = await NyalaFactory.create(AppModule);
     *   app.use(new TenantMiddleware(tenantResolver));
     */
    use(middleware: { use(req: any, res: any, next: () => Promise<void>): Promise<void> }): this {
        if (!this.httpAdapter) {
            throw new Error("Call setHttpAdapter() before registering middleware");
        }
        this.httpAdapter.addMiddleware(middleware);
        return this;
    }

    /**
     * Resolves all decorated routes and binds them onto the HTTP adapter,
     * and auto-registers global middleware from ConfigService if present.
     * `listen()` calls this before starting the server; `TestingModule`
     * calls it too, so routes are bound before tests run — without it,
     * `HttpTestClient` requests 404 against an adapter with zero routes.
     *
     * Async for forward compatibility with adapter hooks that need to await
     * something here — nothing currently does, so `await`ing this call is
     * optional today, but keep doing it (as `listen()` and `TestingModule`
     * both do) rather than relying on that staying true.
     */
    async bindRoutes(): Promise<void> {
        if (!this.httpAdapter) {
            throw new Error("HTTP adapter not configured");
        }

        // Resolve all routes via the DI container and decorators
        // Note: we fetch the private metadataScanner and moduleGraph from kernel
        const metadataScanner = (this.kernel as any).metadataScanner || new MetadataScanner();
        const routeResolver = new RouteResolver(
            metadataScanner,
            this.kernel.getContainer(),
            this.kernel.getModuleGraph()
        );
        const resolvedRoutes = routeResolver.resolveRoutes();

        if (typeof this.httpAdapter.registerResolvedRoutes === "function") {
            this.httpAdapter.registerResolvedRoutes(resolvedRoutes);
        }

        // Same duck-typed opt-in as registerResolvedRoutes() above: core has
        // no notion of WebSocket gateways (that's @nyalajs/http's
        // FastifyAdapter-specific concern), so this only fires for adapters
        // that actually implement it — a no-op for any adapter that doesn't.
        // Must run before the adapter's listen()/ready() call — the adapter
        // queues gateway route registration at construction time and this
        // only unblocks it (see FastifyAdapter's constructor for why routes
        // can't simply be added here directly).
        if (typeof (this.httpAdapter as any).registerWebSocketGateways === "function") {
            (this.httpAdapter as any).registerWebSocketGateways(this.kernel);
        }

        // Auto-register global middleware from ConfigService's "middleware"
        // namespace (config/middleware.ts's `{ global: [...] }` shape) if
        // available. ConfigService is looked up by the STRING token
        // "ConfigService" for historical reasons, but the documented/normal
        // way to register it (as this framework's own starter templates
        // do: `{ provide: ConfigService, useFactory: ... }`) uses the
        // CLASS itself as the token — resolve() only matches the exact
        // token it was registered under, so the string lookup below fails
        // for any app wired that way. @nyalajs/core can't import
        // @nyalajs/config's class directly (config depends on core, not the
        // other way around — that would be a circular package dependency),
        // so the fallback below finds it by scanning registered provider
        // tokens for one named "ConfigService" instead — no cross-package
        // import needed. Critically, only "no ConfigService registered at
        // all" is treated as the normal/quiet case; every other failure (a
        // middleware class itself failing to construct, for instance)
        // warns instead of silently doing nothing. This used to catch and
        // discard ALL errors unconditionally, which meant `config/
        // middleware.ts`'s global middleware (TenantMiddleware in every
        // multi-tenant starter template) silently never ran on any request
        // — reproduced against a real running app where TenantContext was
        // never set despite TenantMiddleware being correctly listed there.
        let configService: any;
        try {
            configService = this.kernel.getContainer().resolve<any>("ConfigService");
        } catch {
            const classToken = [...this.kernel.getContainer().getProviders().keys()].find(
                (token) => typeof token === "function" && (token as Function).name === "ConfigService"
            );
            if (classToken) {
                try {
                    configService = this.kernel.getContainer().resolve<any>(classToken);
                } catch {
                    configService = undefined;
                }
            }
        }

        if (configService) {
            try {
                const middlewareConfig = configService.getNamespace("middleware") || {};
                const globalMiddleware = middlewareConfig.global || [];
                for (const mwClass of globalMiddleware) {
                    const mwInstance = this.kernel.getContainer().resolve(mwClass);
                    this.use(mwInstance as any);
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                console.warn(
                    `[nyala] Warning: found a ConfigService but failed to auto-register global middleware from its ` +
                    `"middleware" namespace (${message}). Global middleware (e.g. TenantMiddleware) will NOT run on ` +
                    `any request until this is fixed.`
                );
            }
        }
    }

    async listen(port: number, host: string = "0.0.0.0"): Promise<void> {
        if (!this.httpAdapter) {
            throw new Error("HTTP adapter not configured");
        }

        await this.bindRoutes();

        // Boot plugins just before listening, so all modules are ready
        await this.bootPlugins();
        await this.httpAdapter.listen(port, host);
    }

    async close(): Promise<void> {
        if (this.httpAdapter) {
            await this.httpAdapter.close();
        }
        await this.kernel.shutdown();
    }

    getKernel(): Kernel {
        return this.kernel;
    }

    get<T>(token: any): T {
        return this.kernel.getContainer().resolve<T>(token);
    }
}

export class NyalaFactory {
    static async create(
        rootModule: Type,
        options: NyalaOptions = {}
    ): Promise<NyalaApplication> {
        installProcessErrorHandlers();
        const kernel = new Kernel();
        await kernel.bootstrap(rootModule);
        const app = new NyalaApplication(kernel, options);
        return app;
    }
}

