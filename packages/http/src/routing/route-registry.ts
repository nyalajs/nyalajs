import { Type } from "@nyalajs/core";

export interface RouteDefinition {
    method: string;
    path: string;
    controller: Type;
    handlerName: string;
    guards?: Type[];
    interceptors?: Type[];
    metadata: Record<string, any>;
}

export class RouteRegistry {
    private routes: RouteDefinition[] = [];

    register(route: RouteDefinition): void {
        this.routes.push(route);
    }

    match(method: string, path: string): RouteDefinition | undefined {
        return this.routes.find(
            (route) =>
                route.method.toUpperCase() === method.toUpperCase() &&
                this.matchPath(route.path, path)
        );
    }

    getAll(): RouteDefinition[] {
        return this.routes;
    }

    private matchPath(pattern: string, path: string): boolean {
        // Simple path matching - can be enhanced with path-to-regexp
        const patternParts = pattern.split("/");
        const pathParts = path.split("/");

        if (patternParts.length !== pathParts.length) {
            return false;
        }

        return patternParts.every((part, i) => {
            if (part.startsWith(":")) {
                return true; // Parameter match
            }
            return part === pathParts[i];
        });
    }
}
