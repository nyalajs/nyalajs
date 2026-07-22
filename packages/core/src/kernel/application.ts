import { Type } from "../types/common";
import { Kernel } from "./kernel";
import { PluginManager } from "../plugins/plugin.manager";
import { NyalaPlugin } from "../plugins/plugin.interface";
import { RouteResolver } from "../routing/route-resolver";
import { MetadataScanner } from "../metadata/metadata-scanner";

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

    async listen(port: number, host: string = "0.0.0.0"): Promise<void> {
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

        // Auto-register global middleware from ConfigService if available
        try {
            const configService = this.kernel.getContainer().resolve<any>("ConfigService");
            if (configService) {
                const middlewareConfig = configService.getNamespace("middleware") || {};
                const globalMiddleware = middlewareConfig.global || [];
                for (const mwClass of globalMiddleware) {
                    const mwInstance = this.kernel.getContainer().resolve(mwClass);
                    this.use(mwInstance as any);
                }
            }
        } catch (e) {
            // ConfigService not bound or middleware namespace missing, skip
        }
        
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
        const kernel = new Kernel();
        await kernel.bootstrap(rootModule);
        const app = new NyalaApplication(kernel, options);
        return app;
    }
}

