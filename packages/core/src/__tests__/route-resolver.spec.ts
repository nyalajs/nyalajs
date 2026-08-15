import { describe, it, expect } from "vitest";
import { RouteResolver } from "../routing/route-resolver";
import { MetadataScanner } from "../metadata/metadata-scanner";
import { Container } from "../di/container";
import { ModuleGraph } from "../module/module-graph";
import { Controller, Get, Post } from "../index";
import { Module } from "../index";
import { UseGuards, UseInterceptors } from "../decorators/use";
import { UseFilters } from "../decorators/catch";

@Controller("users")
class UserController {
    @Get()
    listUsers() {}

    @Post("create")
    createUser() {}
}

@Module({ controllers: [UserController] })
class UserModule {}

class AuthGuard {
    canActivate() {
        return true;
    }
}

class RolesGuard {
    canActivate() {
        return true;
    }
}

class AuditInterceptor {}

class NotFoundFilter {
    catch() {}
}

@UseGuards(AuthGuard)
@Controller("admin")
class AdminController {
    @Get()
    index() {}

    @Get("reports")
    @UseGuards(RolesGuard)
    reports() {}

    @Post("audited")
    @UseInterceptors(AuditInterceptor)
    audited() {}

    @Get("maybe-missing")
    @UseFilters(NotFoundFilter)
    maybeMissing() {}
}

@Module({ controllers: [AdminController] })
class AdminModule {}

function buildRoutes(controllerType: any, moduleType: any) {
    const scanner = new MetadataScanner();
    const container = new Container();
    const graph = new ModuleGraph();

    container.register({ provide: controllerType, useClass: controllerType });
    graph.add({
        id: moduleType.name,
        type: moduleType,
        metadata: { controllers: [controllerType] },
        imports: [],
        providers: new Map(),
        exports: new Set(),
    });

    return new RouteResolver(scanner, container, graph).resolveRoutes();
}

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

    it("attaches a class-level @UseGuards() to every route on that controller", () => {
        const routes = buildRoutes(AdminController, AdminModule);

        const index = routes.find(r => r.handlerName === "index");
        expect(index?.guards).toEqual([AuthGuard]);
    });

    it("a method-level @UseGuards() replaces (not merges with) the class-level guards", () => {
        const routes = buildRoutes(AdminController, AdminModule);

        const reports = routes.find(r => r.handlerName === "reports");
        expect(reports?.guards).toEqual([RolesGuard]);
    });

    it("attaches method-level @UseInterceptors()", () => {
        const routes = buildRoutes(AdminController, AdminModule);

        const audited = routes.find(r => r.handlerName === "audited");
        expect(audited?.interceptors).toEqual([AuditInterceptor]);
    });

    it("leaves guards/interceptors undefined for a controller with no @UseGuards()/@UseInterceptors()", () => {
        const routes = buildRoutes(UserController, UserModule);

        for (const route of routes) {
            expect(route.guards).toBeUndefined();
            expect(route.interceptors).toBeUndefined();
        }
    });

    it("attaches method-level @UseFilters()", () => {
        const routes = buildRoutes(AdminController, AdminModule);

        const maybeMissing = routes.find(r => r.handlerName === "maybeMissing");
        expect(maybeMissing?.filters).toEqual([NotFoundFilter]);
    });

    it("leaves filters undefined for a route with no @UseFilters()", () => {
        const routes = buildRoutes(AdminController, AdminModule);

        const index = routes.find(r => r.handlerName === "index");
        expect(index?.filters).toBeUndefined();
    });
});
