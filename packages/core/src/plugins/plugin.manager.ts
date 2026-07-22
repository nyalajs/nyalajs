import { NyalaPlugin } from "./plugin.interface";

/**
 * Manages lifecycle of all registered plugins.
 * 
 * The boot sequence is always:
 *  1. `register()` is called on every plugin, in order.
 *  2. `boot()` is called on every plugin that defines it, in order.
 *
 * This two-phase approach ensures that when `boot()` runs, all services
 * from all plugins are already registered and available via DI.
 */
export class PluginManager {
    private plugins: NyalaPlugin[] = [];

    /**
     * Register one or more plugins with the manager.
     */
    register(...plugins: NyalaPlugin[]): this {
        this.plugins.push(...plugins);
        return this;
    }

    /**
     * Execute the two-phase boot sequence for all registered plugins.
     * Called by NyalaApplication during startup.
     */
    async boot(app: any): Promise<void> {
        // Phase 1 — register
        for (const plugin of this.plugins) {
            try {
                await plugin.register(app);
                console.log(`[nyala/plugins] Registered: ${plugin.name}`);
            } catch (error) {
                console.error(`[nyala/plugins] Error registering plugin [${plugin.name}]:`, error);
                throw error;
            }
        }

        // Phase 2 — boot
        for (const plugin of this.plugins) {
            if (plugin.boot) {
                try {
                    await plugin.boot(app);
                } catch (error) {
                    console.error(`[nyala/plugins] Error booting plugin [${plugin.name}]:`, error);
                    throw error;
                }
            }
        }
    }

    /**
     * Retrieve a registered plugin by name.
     */
    getPlugin(name: string): NyalaPlugin | undefined {
        return this.plugins.find(p => p.name === name);
    }

    /**
     * Returns all registered plugin names.
     */
    getPluginNames(): string[] {
        return this.plugins.map(p => p.name);
    }
}
