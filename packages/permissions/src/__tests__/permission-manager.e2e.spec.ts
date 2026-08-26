import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { DatabaseService, Model, Table, Primary, StringColumn } from "@nyalajs/database";
import { CacheService } from "@nyalajs/cache";
import { RoleService } from "../services/role.service";
import { PermissionService } from "../services/permission.service";
import { PermissionManager } from "../services/permission-manager";
import { PermissionCache } from "../services/permission-cache";
import { Role } from "../models/role.model";
import { Permission } from "../models/permission.model";
import { ModelHasRole } from "../models/model-has-role.model";
import { ModelHasPermission } from "../models/model-has-permission.model";
import { RoleHasPermission } from "../models/role-has-permission.model";

@Table("users")
class User extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;
}

describe("Permission system (e2e, real SQLite) — Role/Permission/PermissionManager", () => {
    const db = new DatabaseService();
    let cache: PermissionCache;
    let roleService: RoleService;
    let permissionService: PermissionService;
    let manager: PermissionManager;

    beforeAll(async () => {
        await db.connect({ driver: "better-sqlite3", connectionString: ":memory:" });
        Model.setDatabase(db.getDb());

        const raw = db.getDb() as any;
        raw.run("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
        raw.run(`CREATE TABLE roles (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, guardName TEXT NOT NULL,
            teamId TEXT, createdAt INTEGER, updatedAt INTEGER
        )`);
        raw.run(`CREATE TABLE permissions (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, guardName TEXT NOT NULL,
            createdAt INTEGER, updatedAt INTEGER
        )`);
        raw.run(`CREATE TABLE role_has_permissions (
            id TEXT PRIMARY KEY, roleId TEXT NOT NULL, permissionId TEXT NOT NULL
        )`);
        raw.run(`CREATE TABLE model_has_roles (
            id TEXT PRIMARY KEY, roleId TEXT NOT NULL, modelType TEXT NOT NULL,
            modelId TEXT NOT NULL, teamId TEXT
        )`);
        raw.run(`CREATE TABLE model_has_permissions (
            id TEXT PRIMARY KEY, permissionId TEXT NOT NULL, modelType TEXT NOT NULL,
            modelId TEXT NOT NULL, teamId TEXT
        )`);

        const cacheService = new CacheService();
        await cacheService.connect(); // no url -> in-memory
        cache = new PermissionCache(cacheService);
        roleService = new RoleService(cache);
        permissionService = new PermissionService(cache, roleService);
        manager = new PermissionManager(roleService, permissionService);
    });

    afterAll(async () => {
        await db.disconnect();
    });

    beforeEach(async () => {
        const raw = db.getDb() as any;
        for (const table of [
            "model_has_permissions",
            "model_has_roles",
            "role_has_permissions",
            "permissions",
            "roles",
            "users",
        ]) {
            raw.run(`DELETE FROM ${table}`);
        }
        cache.flush();
    });

    async function makeUser(name: string): Promise<User> {
        return User.create({ id: crypto.randomUUID(), name } as any);
    }

    it("assigns a role and the user has it", async () => {
        const user = await makeUser("Alice");
        await manager.assignRole(user, "editor");

        expect(await manager.hasRole(user, "editor")).toBe(true);
        expect(await manager.hasRole(user, "admin")).toBe(false);
        expect(await manager.getRoleNames(user)).toEqual(["editor"]);
    });

    it("a role's permissions are inherited by every user with that role", async () => {
        const user = await makeUser("Bob");
        await manager.assignRole(user, "editor");

        const role = await roleService.findByName("editor");
        const permission = await permissionService.findOrCreate("posts.edit");
        await roleService.givePermissionToRole(role!, permission);

        expect(await manager.can(user, "posts.edit")).toBe(true);
        expect(await manager.hasPermissionViaRole(user, "posts.edit")).toBe(true);
        expect(await manager.hasDirectPermission(user, "posts.edit")).toBe(false);
    });

    it("a permission can be granted directly, bypassing roles entirely", async () => {
        const user = await makeUser("Carol");
        await manager.givePermissionTo(user, "posts.publish");

        expect(await manager.can(user, "posts.publish")).toBe(true);
        expect(await manager.hasDirectPermission(user, "posts.publish")).toBe(true);
        expect(await manager.hasPermissionViaRole(user, "posts.publish")).toBe(false);
        expect(await manager.getRoleNames(user)).toEqual([]);
    });

    it("getAllPermissions returns the union of direct grants and role-derived permissions, deduplicated", async () => {
        const user = await makeUser("Dave");
        await manager.assignRole(user, "editor");
        const role = await roleService.findByName("editor");
        const editPermission = await permissionService.findOrCreate("posts.edit");
        await roleService.givePermissionToRole(role!, editPermission);
        await manager.givePermissionTo(user, "posts.publish");
        await manager.givePermissionTo(user, "posts.edit"); // same as role-derived one -> must dedupe

        const all = await manager.getAllPermissions(user);
        expect(all.sort()).toEqual(["posts.edit", "posts.publish"]);
    });

    it("wildcard permissions match sub-permissions", async () => {
        const user = await makeUser("Eve");
        await manager.givePermissionTo(user, "posts.*");

        expect(await manager.can(user, "posts.create")).toBe(true);
        expect(await manager.can(user, "posts.delete")).toBe(true);
        expect(await manager.can(user, "comments.delete")).toBe(false);
    });

    it("removeRole actually revokes the role-derived permission", async () => {
        const user = await makeUser("Frank");
        await manager.assignRole(user, "editor");
        const role = await roleService.findByName("editor");
        const permission = await permissionService.findOrCreate("posts.edit");
        await roleService.givePermissionToRole(role!, permission);
        expect(await manager.can(user, "posts.edit")).toBe(true);

        await manager.removeRole(user, "editor");
        expect(await manager.can(user, "posts.edit")).toBe(false);
        expect(await manager.hasRole(user, "editor")).toBe(false);
    });

    it("syncRoles replaces the full role set", async () => {
        const user = await makeUser("Grace");
        await manager.assignRole(user, "editor");
        await manager.assignRole(user, "viewer");
        expect((await manager.getRoleNames(user)).sort()).toEqual(["editor", "viewer"]);

        await manager.syncRoles(user, ["admin"]);
        expect(await manager.getRoleNames(user)).toEqual(["admin"]);
    });

    it("hasAnyRole / hasAllRoles / hasExactRoles behave correctly", async () => {
        const user = await makeUser("Heidi");
        await manager.assignRole(user, "editor");
        await manager.assignRole(user, "viewer");

        expect(await manager.hasAnyRole(user, ["admin", "editor"])).toBe(true);
        expect(await manager.hasAllRoles(user, ["editor", "viewer"])).toBe(true);
        expect(await manager.hasAllRoles(user, ["editor", "admin"])).toBe(false);
        expect(await manager.hasExactRoles(user, ["editor", "viewer"])).toBe(true);
        expect(await manager.hasExactRoles(user, ["editor"])).toBe(false);
    });

    it("hasAnyPermission / hasAllPermissions honor wildcards across a mixed set", async () => {
        const user = await makeUser("Ivan");
        await manager.givePermissionTo(user, "posts.*");
        await manager.givePermissionTo(user, "comments.delete");

        expect(await manager.hasAnyPermission(user, ["posts.create", "nonexistent"])).toBe(true);
        expect(await manager.hasAllPermissions(user, ["posts.create", "comments.delete"])).toBe(true);
        expect(await manager.hasAllPermissions(user, ["posts.create", "nonexistent"])).toBe(false);
    });

    it("permission checks are cached — a role change is invisible until cache invalidation, then correct immediately after", async () => {
        const user = await makeUser("Judy");
        await manager.assignRole(user, "editor");
        const role = await roleService.findByName("editor");
        const permission = await permissionService.findOrCreate("posts.edit");

        // Before granting: cached "no permission" result.
        expect(await manager.can(user, "posts.edit")).toBe(false);

        await roleService.givePermissionToRole(role!, permission); // flushes cache (role-level change)
        expect(await manager.can(user, "posts.edit")).toBe(true);
    });

    it("real tenant/team scoping: the same role name in two tenants are independent, and a user's role assignment is scoped to one tenant", async () => {
        const user = await makeUser("Mallory");
        await manager.assignRole(user, "admin", { tenantId: "tenant-a" });

        expect(await manager.hasRole(user, "admin", { tenantId: "tenant-a" })).toBe(true);
        expect(await manager.hasRole(user, "admin", { tenantId: "tenant-b" })).toBe(false);
        expect(await manager.hasRole(user, "admin")).toBe(false); // no tenant = global scope, different from either tenant
    });
});
