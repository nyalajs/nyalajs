import { describe, it, expect } from "vitest";
import { RouteResolver } from "../routing/route-resolver";
import { MetadataScanner } from "../metadata/metadata-scanner";
import { Container } from "../di/container";
import { ModuleGraph } from "../module/module-graph";
import { Controller, Get, Post } from "../index";
import { Module } from "../index";

@Controller("users")
class UserController {
    @Get()
    listUsers() {}

    @Post("create")
    createUser() {}
}

@Module({ controllers: [UserController] })
class UserModule {}

describe("RouteResolver", () => {
    it("resolves routes from a controller with proper paths and methods", () => {
        const scanner = new MetadataScanner();
        const container = new Container();
        const graph = new ModuleGraph();
        
        container.register({ provide: UserController, useClass: UserController });
        graph.add({
            id: "UserModule",
            type: UserModule,
            metadata: { controllers: [UserController] },
            imports: [],
            providers: new Map(),
            exports: new Set()
        });

        const resolver = new RouteResolver(scanner, container, graph);
        const routes = resolver.resolveRoutes();

        expect(routes).toHaveLength(2);

        const listRoute = routes.find(r => r.path === "/users" && r.method === "GET");
        expect(listRoute).toBeDefined();
        expect(listRoute?.handlerName).toBe("listUsers");

        const createRoute = routes.find(r => r.path === "/users/create" && r.method === "POST");
        expect(createRoute).toBeDefined();
        expect(createRoute?.handlerName).toBe("createUser");
    });
});
