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
                // Ensure the controller is instantiated in the container
                try {
                    this.container.resolve(controllerType);
                } catch (e) {
                    continue;
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

                    routes.push({
                        method: route.method,
                        path: resolvedPath,
                        controller: controllerType,
                        handlerName: route.handlerName as string,
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
