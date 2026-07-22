import { Type } from "../types/common";
import { Container } from "../di/container";
import { ModuleGraph } from "../module/module-graph";
import { ModuleLoader } from "../module/module-loader";
import { MetadataScanner } from "../metadata/metadata-scanner";
import {
    OnModuleInit,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from "../types/lifecycle";

export class Kernel {
    private readonly metadataScanner = new MetadataScanner();
    private readonly moduleGraph = new ModuleGraph();
    private readonly moduleLoader = new ModuleLoader(
        this.metadataScanner,
        this.moduleGraph
    );
    private readonly container = new Container();
    private providers: any[] = [];

    async bootstrap(rootModule: Type): Promise<void> {
        // Load modules
        this.moduleLoader.load(rootModule);

        // Register providers
        this.registerProviders();

        // Execute lifecycle hooks
        await this.executeLifecycleHooks();
    }

    async shutdown(): Promise<void> {
        // Execute shutdown hooks
        for (const provider of this.providers) {
            if (this.hasShutdownHook(provider)) {
                await (provider as OnApplicationShutdown).onApplicationShutdown();
            }
        }
    }

    getContainer(): Container {
        return this.container;
    }

    getModuleGraph(): ModuleGraph {
        return this.moduleGraph;
    }

    private registerProviders(): void {
        for (const module of this.moduleGraph.values()) {
            for (const [, provider] of module.providers) {
                this.container.register(provider);
            }
        }
    }

    private async executeLifecycleHooks(): Promise<void> {
        // Resolve all providers to trigger instantiation
        for (const module of this.moduleGraph.values()) {
            for (const [token] of module.providers) {
                try {
                    const instance = this.container.resolve(token);
                    this.providers.push(instance);
                } catch (error) {
                    // Skip providers that can't be resolved yet
                }
            }
        }

        // Execute onModuleInit
        for (const provider of this.providers) {
            if (this.hasModuleInitHook(provider)) {
                await (provider as OnModuleInit).onModuleInit();
            }
        }

        // Execute onApplicationBootstrap
        for (const provider of this.providers) {
            if (this.hasBootstrapHook(provider)) {
                await (provider as OnApplicationBootstrap).onApplicationBootstrap();
            }
        }
    }

    private hasModuleInitHook(instance: any): instance is OnModuleInit {
        return typeof instance.onModuleInit === "function";
    }

    private hasBootstrapHook(instance: any): instance is OnApplicationBootstrap {
        return typeof instance.onApplicationBootstrap === "function";
    }

    private hasShutdownHook(instance: any): instance is OnApplicationShutdown {
        return typeof instance.onApplicationShutdown === "function";
    }
}
