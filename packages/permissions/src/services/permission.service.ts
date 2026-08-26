import { randomUUID } from "node:crypto";
import { Injectable } from "@nyalajs/core";
import { SchemaRegistry } from "@nyalajs/database";
import { connection } from "./connection";
import { eq, and, isNull } from "drizzle-orm";
import { Permission } from "../models/permission.model";
import { Role } from "../models/role.model";
import { RoleHasPermission } from "../models/role-has-permission.model";
import { ModelHasPermission } from "../models/model-has-permission.model";
import { ModelHasRole } from "../models/model-has-role.model";
import { Subject } from "./subject";
import { PermissionCache } from "./permission-cache";
import { anyMatchesPermission } from "./permission-matcher";
import { RoleService } from "./role.service";

export interface PermissionScope {
    guardName?: string;
}

/**
 * Permission CRUD, direct-grant management, and the actual `can`/`hasPermissionTo`
 * checks — the heart of this package. Mirrors Spatie's HasPermissions trait
 * plus Permission model statics (Permission::findOrCreate).
 */
@Injectable()
export class PermissionService {
    constructor(
        private readonly cache: PermissionCache,
        private readonly roleService: RoleService
    ) {}

    // ---- Permission CRUD ----

    async findByName(name: string, scope: PermissionScope = {}): Promise<Permission | null> {
        const guardName = scope.guardName ?? "api";
        const rows = await Permission.query().where("name", name).where("guardName", guardName).get();
        return rows[0] ?? null;
    }

    async findOrCreate(name: string, scope: PermissionScope = {}): Promise<Permission> {
        const existing = await this.findByName(name, scope);
        if (existing) return existing;

        return Permission.create({
            id: randomUUID(),
            name,
            guardName: scope.guardName ?? "api",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
    }

    async delete(permission: Permission): Promise<void> {
        const conn = connection();

        const roleTable = SchemaRegistry.getTable(RoleHasPermission);
        await conn.delete(roleTable).where(eq((roleTable as any).permissionId, permission.id));

        const directTable = SchemaRegistry.getTable(ModelHasPermission);
        await conn.delete(directTable).where(eq((directTable as any).permissionId, permission.id));

        await permission.delete();
        this.cache.flush();
    }

    // ---- Direct grants (Subject <-> Permission, bypassing roles) ----

    async givePermissionTo(subject: Subject, permission: Permission): Promise<void> {
        const already = await this.subjectHasDirectGrantRow(subject, permission.id);
        if (already) return;

        await ModelHasPermission.create({
            id: randomUUID(),
            permissionId: permission.id,
            modelType: subject.modelType,
            modelId: subject.modelId,
            teamId: subject.tenantId,
        } as any);
        this.cache.flushFor(subject);
    }

    async revokePermissionFrom(subject: Subject, permission: Permission): Promise<void> {
        const table = SchemaRegistry.getTable(ModelHasPermission);
        const conn = connection();
        await conn
            .delete(table)
            .where(
                and(
                    eq((table as any).permissionId, permission.id),
                    eq((table as any).modelType, subject.modelType),
                    eq((table as any).modelId, subject.modelId),
                    subject.tenantId ? eq((table as any).teamId, subject.tenantId) : isNull((table as any).teamId)
                )
            );
        this.cache.flushFor(subject);
    }

    /** Replaces ALL of a subject's DIRECT permission grants (not role-derived ones) with exactly this set. */
    async syncPermissions(subject: Subject, permissions: Permission[]): Promise<void> {
        const table = SchemaRegistry.getTable(ModelHasPermission);
        const conn = connection();
        await conn
            .delete(table)
            .where(
                and(
                    eq((table as any).modelType, subject.modelType),
                    eq((table as any).modelId, subject.modelId),
                    subject.tenantId ? eq((table as any).teamId, subject.tenantId) : isNull((table as any).teamId)
                )
            );

        for (const permission of permissions) {
            await conn.insert(table).values({
                id: randomUUID(),
                permissionId: permission.id,
                modelType: subject.modelType,
                modelId: subject.modelId,
                teamId: subject.tenantId,
            });
        }
        this.cache.flushFor(subject);
    }

    private async subjectHasDirectGrantRow(subject: Subject, permissionId: string): Promise<boolean> {
        const rows = await ModelHasPermission.query()
            .where("permissionId", permissionId)
            .where("modelType", subject.modelType)
            .where("modelId", subject.modelId)
            .get();
        return subject.tenantId
            ? rows.some((r) => r.teamId === subject.tenantId)
            : rows.some((r) => !r.teamId);
    }

    // ---- Resolution ----

    /** Permission names granted DIRECTLY to `subject` (not via any role). Mirrors Spatie's getDirectPermissions(). */
    async getDirectPermissionNames(subject: Subject): Promise<string[]> {
        const grants = await ModelHasPermission.query()
            .where("modelType", subject.modelType)
            .where("modelId", subject.modelId)
            .get();

        const scoped = subject.tenantId
            ? grants.filter((g) => g.teamId === subject.tenantId)
            : grants.filter((g) => !g.teamId);

        if (scoped.length === 0) return [];

        const permissionIds = [...new Set(scoped.map((g) => g.permissionId))];
        const permissions = await Permission.query().whereIn("id", permissionIds).get();
        return permissions.map((p) => p.name);
    }

    /** Permission names granted via any of `subject`'s roles. Mirrors Spatie's getPermissionsViaRoles(). */
    async getPermissionNamesViaRoles(subject: Subject): Promise<string[]> {
        const roles = await this.roleService.rolesFor(subject);
        if (roles.length === 0) return [];

        const roleIds = roles.map((r) => r.id);
        const links = await RoleHasPermission.query().whereIn("roleId", roleIds).get();
        if (links.length === 0) return [];

        const permissionIds = [...new Set(links.map((l) => l.permissionId))];
        const permissions = await Permission.query().whereIn("id", permissionIds).get();
        return permissions.map((p) => p.name);
    }

    /**
     * Every permission name effectively granted to `subject` — direct
     * grants UNION permissions via roles, deduplicated. Cached (see
     * PermissionCache) since this is what every hasPermissionTo() call
     * ultimately resolves and checks against.
     */
    async getAllPermissionNames(subject: Subject): Promise<string[]> {
        return this.cache.remember(subject, async () => {
            const [direct, viaRoles] = await Promise.all([
                this.getDirectPermissionNames(subject),
                this.getPermissionNamesViaRoles(subject),
            ]);
            return [...new Set([...direct, ...viaRoles])];
        });
    }

    /** True if `subject` has `permissionName` — directly, via a role, or via a wildcard grant ("posts.*" satisfies a check for "posts.create"). */
    async hasPermissionTo(subject: Subject, permissionName: string): Promise<boolean> {
        const granted = await this.getAllPermissionNames(subject);
        return anyMatchesPermission(granted, permissionName);
    }

    async hasAnyPermission(subject: Subject, permissionNames: string[]): Promise<boolean> {
        const granted = await this.getAllPermissionNames(subject);
        return permissionNames.some((name) => anyMatchesPermission(granted, name));
    }

    async hasAllPermissions(subject: Subject, permissionNames: string[]): Promise<boolean> {
        const granted = await this.getAllPermissionNames(subject);
        return permissionNames.every((name) => anyMatchesPermission(granted, name));
    }
}
