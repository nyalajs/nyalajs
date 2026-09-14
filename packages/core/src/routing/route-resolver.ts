import { Type } from "../types/common";
import { MetadataScanner } from "../metadata/metadata-scanner";
import { Container } from "../di/container";
import { ModuleGraph } from "../module/module-graph";

export interface ResolvedRoute {
    method: string;
    path: string;
    controller: Type;
    handlerName: string;
    guards?: Type[];
    interceptors?: Type[];
    filters?: Type[];
    metadata: Record<string, any>;
}

export class RouteResolver {
    constructor(
        private readonly metadataScanner: MetadataScanner,
        private readonly container: Container,
        private readonly moduleGraph: ModuleGraph
    ) {}

    public resolveRoutes(): ResolvedRoute[] {
        const routes: ResolvedRoute[] = [];

        for (const module of this.moduleGraph.values()) {
            const controllers = module.metadata.controllers ?? [];
            for (const controllerType of controllers) {
                // Sanity-check that the controller's dependency graph is
                // actually wired up (catches typos/missing providers before
                // a single request ever hits it) — but resolved from THIS
                // (singleton, module-level) container, so a controller that
                // legitimately depends on a request-scoped token ("REQUEST",
                // "RESPONSE", "REQUEST_CONTEXT" — only registered per-request,
                // see FastifyAdapter.handleRequestInScope()) will always
                // throw here even though it resolves fine on every real
                // request. That's expected and NOT a wiring error, so it
                // must never be treated as fatal — this used to silently
                // `continue` on ANY resolve() failure, which meant a
                // controller with a genuine typo'd/missing provider AND one
                // that simply used a request-scoped token were
                // indistinguishable: both vanished from the route table
                // with zero output, a route just 404s and there is no clue
                // why. Warn loudly either way instead of guessing which
                // case this is — silence here is strictly worse than a
                // possibly-unnecessary warning for the legitimate case.
                try {
                    this.container.resolve(controllerType);
                } catch (e) {
                    const name = (controllerType as any)?.name ?? String(controllerType);
                    const message = e instanceof Error ? e.message : String(e);
                    console.warn(
                        `[nyala] Warning: could not eagerly construct controller "${name}" while registering routes ` +
                        `(${message}). If this is because "${name}" (or something it depends on) injects a ` +
                        `request-scoped token (REQUEST/RESPONSE/REQUEST_CONTEXT) in its constructor, this is expected ` +
                        `and its routes are still registered normally below — request-scoped values are only ` +
                        `available once a real request comes in. If "${name}" is NOT using request-scoped injection, ` +
                        `this points at a real, broken provider in its dependency graph, and its routes will 404.`
                    );
                }

                const controllerMeta = this.metadataScanner.getControllerMetadata(controllerType);
                if (!controllerMeta) continue;

                const controllerVersion = this.metadataScanner.getVersion(controllerType);
                const methodRoutes = this.metadataScanner.getRoutes(controllerType);

                for (const route of methodRoutes) {
                    const handler = controllerType.prototype[route.handlerName as string];
                    const methodVersion = handler
                        ? this.metadataScanner.getVersion(handler)
                        : undefined;

                    const activeVersion = methodVersion ?? controllerVersion;
                    const resolvedPath = this.buildPath(controllerMeta.prefix, route.path, activeVersion);

                    const guards = this.metadataScanner.getGuards(controllerType, route.handlerName);
                    const interceptors = this.metadataScanner.getInterceptors(controllerType, route.handlerName);
                    const filters = this.metadataScanner.getFilters(controllerType, route.handlerName);

                    routes.push({
                        method: route.method,
                        path: resolvedPath,
                        controller: controllerType,
                        handlerName: route.handlerName as string,
                        guards: guards.length > 0 ? guards : undefined,
                        interceptors: interceptors.length > 0 ? interceptors : undefined,
                        filters: filters.length > 0 ? filters : undefined,
                        metadata: {},
                    });
                }
            }
        }

        return routes;
    }

    private buildPath(prefix: string, routePath: string, version?: string | string[]): string {
        let fullPath = "";

        // Handle API version prefix — produces /v1, /v2, etc.
        if (version) {
            const versionStr = Array.isArray(version) ? version[0] : version;
            fullPath += "/v" + versionStr;
        }

        // Handle controller prefix
        if (prefix && prefix !== "/") {
            fullPath += prefix.startsWith("/") ? prefix : "/" + prefix;
        }

        // Handle individual route path
        if (routePath && routePath !== "/") {
            fullPath += routePath.startsWith("/") ? routePath : "/" + routePath;
        }

        return fullPath || "/";
    }
}
