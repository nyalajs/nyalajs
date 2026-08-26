import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
    Controller,
    Get,
    Injectable,
    Module,
    NyalaFactory,
    UseGuards,
} from "@nyalajs/core";
import { FastifyAdapter } from "@nyalajs/http";
import { AuthGuard, JwtStrategy, UserIdentity, Roles } from "@nyalajs/security";
import { DatabaseService, Model, Table, Primary, StringColumn } from "@nyalajs/database";
import { CacheService } from "@nyalajs/cache";
import { Permissions } from "../decorators/permissions.decorator";
import { PermissionsGuard } from "../guards/permissions.guard";
import { DBRolesGuard } from "../guards/db-roles.guard";
import { RoleOrPermission } from "../decorators/role-or-permission.decorator";
import { RoleOrPermissionGuard } from "../guards/role-or-permission.guard";
import { RoleService } from "../services/role.service";
import { PermissionService } from "../services/permission.service";
import { PermissionManager } from "../services/permission-manager";
import { PermissionCache } from "../services/permission-cache";
import { SUPER_ADMIN_ROLES } from "../config/super-admin.token";

// Real end-to-end proof, over real HTTP: AuthGuard (JWT) -> PermissionsGuard/
// DBRolesGuard/RoleOrPermissionGuard (DB-backed), through a real Fastify
// server, real DI resolution, real SQLite. Not the fake ExecutionContext
// unit-test pattern @nyalajs/security's own authorization.spec.ts used —
// this is the actual HTTP pipeline apps run in production.

@Table("users")
class User extends Model {
    @Primary() @StringColumn() id!: string;
}

const JWT_SECRET = "test-secret-for-e2e-only";

@Injectable()
@Controller("posts")
class PostsController {
    @UseGuards(AuthGuard, PermissionsGuard)
    @Permissions("posts.delete")
    @Get("delete-check")
    deleteCheck() {
        return { ok: true };
    }

    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("admin")
    @Get("admin-check")
    adminCheck() {
        return { ok: true };
    }

    @UseGuards(AuthGuard, RoleOrPermissionGuard)
    @RoleOrPermission("editor", "posts.edit")
    @Get("editor-or-permission-check")
    editorOrPermissionCheck() {
        return { ok: true };
    }
}
// esbuild (vitest's default TS transform) strips decorators without
// emitting "design:paramtypes" — unlike `tsc` with emitDecoratorMetadata,
// which is what actually runs in production builds and in every OTHER
// package here (AuthGuard/JwtStrategy come from @nyalajs/security's
// compiled dist/, which already carries real metadata — only classes whose
// SOURCE (not dist/) this test imports need seeding by hand). See
// packages/microservices/src/__tests__/tcp-microservice.e2e.spec.ts for the
// same pattern.
Reflect.defineMetadata("design:paramtypes", [], PostsController);
Reflect.defineMetadata("design:paramtypes", [PermissionService, RoleService, Object], PermissionsGuard);
Reflect.defineMetadata("design:paramtypes", [RoleService, Object], DBRolesGuard);
Reflect.defineMetadata("design:paramtypes", [RoleService, PermissionService, Object], RoleOrPermissionGuard);
Reflect.defineMetadata("design:paramtypes", [CacheService], PermissionCache);
Reflect.defineMetadata("design:paramtypes", [PermissionCache], RoleService);
Reflect.defineMetadata("design:paramtypes", [PermissionCache, RoleService], PermissionService);
Reflect.defineMetadata("design:paramtypes", [RoleService, PermissionService], PermissionManager);

@Module({
    controllers: [PostsController],
    providers: [
        PostsController,
        AuthGuard,
        { provide: JwtStrategy, useValue: new JwtStrategy({ secret: JWT_SECRET }) },
        CacheService,
        PermissionCache,
        RoleService,
        PermissionService,
        PermissionManager,
        PermissionsGuard,
        DBRolesGuard,
        RoleOrPermissionGuard,
        { provide: SUPER_ADMIN_ROLES, useValue: ["super-admin"] },
    ],
})
class TestAppModule {}

describe("PermissionsGuard/DBRolesGuard/RoleOrPermissionGuard (e2e, real Fastify + real AuthGuard + real SQLite)", () => {
    const db = new DatabaseService();
    let app: any;
    let httpAdapter: FastifyAdapter;
    let jwtStrategy: JwtStrategy;
    let manager: PermissionManager;
    let roleService: RoleService;
    let permissionService: PermissionService;

    beforeAll(async () => {
        await db.connect({ driver: "better-sqlite3", connectionString: ":memory:" });
        Model.setDatabase(db.getDb());

        const raw = db.getDb() as any;
        raw.run("CREATE TABLE users (id TEXT PRIMARY KEY)");
        raw.run(`CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, guardName TEXT NOT NULL, teamId TEXT, createdAt INTEGER, updatedAt INTEGER)`);
        raw.run(`CREATE TABLE permissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, guardName TEXT NOT NULL, createdAt INTEGER, updatedAt INTEGER)`);
        raw.run(`CREATE TABLE role_has_permissions (id TEXT PRIMARY KEY, roleId TEXT NOT NULL, permissionId TEXT NOT NULL)`);
        raw.run(`CREATE TABLE model_has_roles (id TEXT PRIMARY KEY, roleId TEXT NOT NULL, modelType TEXT NOT NULL, modelId TEXT NOT NULL, teamId TEXT)`);
        raw.run(`CREATE TABLE model_has_permissions (id TEXT PRIMARY KEY, permissionId TEXT NOT NULL, modelType TEXT NOT NULL, modelId TEXT NOT NULL, teamId TEXT)`);

        app = await NyalaFactory.create(TestAppModule);
        httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), { cors: false, session: false });
        app.setHttpAdapter(httpAdapter);
        await app.bindRoutes();
        await httpAdapter.getInstance().ready();

        jwtStrategy = app.get(JwtStrategy);

        const cacheService = new CacheService();
        await cacheService.connect();
        const cache = new PermissionCache(cacheService);
        roleService = new RoleService(cache);
        permissionService = new PermissionService(cache, roleService);
        manager = new PermissionManager(roleService, permissionService);
    });

    afterAll(async () => {
        await db.disconnect();
    });

    beforeEach(async () => {
        const raw = db.getDb() as any;
        for (const table of ["model_has_permissions", "model_has_roles", "role_has_permissions", "permissions", "roles", "users"]) {
            raw.run(`DELETE FROM ${table}`);
        }
    });

    function tokenFor(user: UserIdentity | { userId: string }): string {
        return jwtStrategy.sign({ sub: (user as any).userId ?? (user as any).sub });
    }

    async function get(path: string, token?: string) {
        const fastify = httpAdapter.getInstance();
        return fastify.inject({
            method: "GET",
            url: path,
            headers: token ? { authorization: `Bearer ${token}` } : {},
        });
    }

    it("rejects with 401 when no token is provided at all (AuthGuard runs first)", async () => {
        const res = await get("/posts/delete-check");
        expect(res.statusCode).toBe(401);
    });

    it("rejects with 403 when authenticated but missing the required permission", async () => {
        await User.create({ id: "u1" } as any);
        const res = await get("/posts/delete-check", tokenFor({ userId: "u1" }));
        expect(res.statusCode).toBe(403);
    });

    it("allows through once the permission is granted directly (no role needed)", async () => {
        await User.create({ id: "u2" } as any);
        await manager.givePermissionTo({ id: "u2" }, "posts.delete");

        const res = await get("/posts/delete-check", tokenFor({ userId: "u2" }));
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
    });

    it("allows through when the permission comes via a role instead of a direct grant", async () => {
        await User.create({ id: "u3" } as any);
        await manager.assignRole({ id: "u3" }, "moderator");
        const role = await roleService.findByName("moderator");
        const permission = await permissionService.findOrCreate("posts.delete");
        await roleService.givePermissionToRole(role!, permission);

        const res = await get("/posts/delete-check", tokenFor({ userId: "u3" }));
        expect(res.statusCode).toBe(200);
    });

    it("DBRolesGuard checks the database live — revoking a role takes effect on the very next request, no new token needed", async () => {
        await User.create({ id: "u4" } as any);
        await manager.assignRole({ id: "u4" }, "admin");
        const token = tokenFor({ userId: "u4" });

        const before = await get("/posts/admin-check", token);
        expect(before.statusCode).toBe(200);

        await manager.removeRole({ id: "u4" }, "admin");

        // SAME token, no re-login — this is the entire point of DBRolesGuard
        // over the JWT-claims-only RolesGuard.
        const after = await get("/posts/admin-check", token);
        expect(after.statusCode).toBe(403);
    });

    it("RoleOrPermissionGuard passes on a matching PERMISSION even with no matching role", async () => {
        await User.create({ id: "u5" } as any);
        await manager.givePermissionTo({ id: "u5" }, "posts.edit");

        const res = await get("/posts/editor-or-permission-check", tokenFor({ userId: "u5" }));
        expect(res.statusCode).toBe(200);
    });

    it("RoleOrPermissionGuard passes on a matching ROLE even with no matching permission", async () => {
        await User.create({ id: "u6" } as any);
        await manager.assignRole({ id: "u6" }, "editor");

        const res = await get("/posts/editor-or-permission-check", tokenFor({ userId: "u6" }));
        expect(res.statusCode).toBe(200);
    });

    it("super-admin bypass: a super-admin role skips the permission check entirely, even with zero grants", async () => {
        await User.create({ id: "u7" } as any);
        await manager.assignRole({ id: "u7" }, "super-admin");

        const res = await get("/posts/delete-check", tokenFor({ userId: "u7" }));
        expect(res.statusCode).toBe(200);
    });
});
