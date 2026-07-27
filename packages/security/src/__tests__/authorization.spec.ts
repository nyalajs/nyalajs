import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { RolesGuard } from "../authorization/roles.guard";
import { Roles } from "../authorization/roles.decorator";
import { PolicyGuard } from "../authorization/policy.guard";
import { UsePolicy, Policy } from "../authorization/policy";

function ctxFor(controller: any, handlerName: string, user?: any): any {
    return {
        route: { controller, handlerName, method: "GET" },
        context: { metadata: new Map(user ? [["user", user]] : []) },
        request: {},
        container: { resolve: (Cls: any) => new Cls() },
    };
}

describe("RolesGuard (regression: metadata must be read from the class, not .prototype)", () => {
    class AdminController {
        @Roles("admin")
        deleteEverything() {}

        noRolesDeclared() {}
    }

    it("denies a user without the required role", async () => {
        const guard = new RolesGuard();
        const ctx = ctxFor(AdminController, "deleteEverything", { roles: ["editor"] });
        await expect(guard.canActivate(ctx)).rejects.toThrow(/does not have required roles/);
    });

    it("allows a user with the required role", async () => {
        const guard = new RolesGuard();
        const ctx = ctxFor(AdminController, "deleteEverything", { roles: ["admin"] });
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it("allows any (authenticated) user when no @Roles() is declared on the handler", async () => {
        const guard = new RolesGuard();
        const ctx = ctxFor(AdminController, "noRolesDeclared", { roles: ["viewer"] });
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
});

describe("PolicyGuard (regression: method-level @UsePolicy must actually be found)", () => {
    class PostPolicy extends Policy {
        update(user: any, resource: any): boolean {
            return resource?.authorId === user?.userId;
        }
    }

    class PostsController {
        @UsePolicy(PostPolicy, "update", 0)
        update() {}
    }

    it("denies when the method-level policy's action returns false", async () => {
        const guard = new PolicyGuard();
        const ctx = ctxFor(PostsController, "update", { userId: "user-1" });
        ctx.request.args = [{ authorId: "someone-else" }];
        await expect(guard.canActivate(ctx)).rejects.toThrow(/Policy denied access/);
    });

    it("allows when the method-level policy's action returns true", async () => {
        const guard = new PolicyGuard();
        const ctx = ctxFor(PostsController, "update", { userId: "user-1" });
        ctx.request.args = [{ authorId: "user-1" }];
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
});
