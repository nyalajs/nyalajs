/**
 * The interface every NyalaJS plugin must implement.
 *
 * @example
 * // plugins/analytics/index.ts
 * import { NyalaPlugin, NyalaApplication } from "@nyala/core";
 *
 * export default class AnalyticsPlugin implements NyalaPlugin {
 *   name = "analytics";
 *
 *   async register(app: NyalaApplication) {
 *     // Register providers, routes, CLI commands...
 *   }
 *
 *   async boot(app: NyalaApplication) {
 *     // Execute after all plugins are registered...
 *   }
 * }
 */
export interface NyalaPlugin {
    /** A unique, slug-style name for the plugin (e.g. "stripe", "analytics"). */
    name: string;

    /**
     * Called during the application boot sequence, before the HTTP server starts.
     * Use this hook to bind services into the DI container, register routes,
     * add middleware, or extend the CLI.
     */
    register(app: any): void | Promise<void>;

    /**
     * Called after ALL plugins have been registered.
     * Use this for work that depends on other plugins being available.
     */
    boot?(app: any): void | Promise<void>;
}
