import { randomUUID } from "node:crypto";
import { Injectable } from "@nyalajs/core";
import { SchemaRegistry } from "@nyalajs/database";
import { connection } from "./connection";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { Role } from "../models/role.model";
import { Permission } from "../models/permission.model";
import { RoleHasPermission } from "../models/role-has-permission.model";
import { ModelHasRole } from "../models/model-has-role.model";
import { Subject } from "./subject";
import { PermissionCache } from "./permission-cache";

export interface RoleScope {
    guardName?: string;
    tenantId?: string;
}

/**
 * Role CRUD and role<->permission attachment, plus assigning/removing roles
 * on a Subject. Mirrors Spatie's Role model static helpers
 * (Role::findOrCreate, Role::findByName) and the permission-attachment
 * half of HasRoles/HasPermissions (givePermissionTo on a Role,
 * assignRole/removeRole/syncRoles on a Subject).
 */
@Injectable()
export class RoleService {
    constructor(private readonly cache: PermissionCache) {}

    // ---- Role CRUD ----

    async findByName(name: string, scope: RoleScope = {}): Promise<Role | null> {
        const guardName = scope.guardName ?? "api";
        const rows = await Role.query()
            .where("name", name)
            .where("guardName", guardName)
            .get();
        const match = scope.tenantId
            ? rows.find((r) => r.teamId === scope.tenantId)
            : rows.find((r) => !r.teamId);
        return match ?? null;
    }

    async findOrCreate(name: string, scope: RoleScope = {}): Promise<Role> {
        const existing = await this.findByName(name, scope);
        if (existing) return existing;

        return Role.create({
            id: randomUUID(),
            name,
            guardName: scope.guardName ?? "api",
            teamId: scope.tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
    }

    async delete(role: Role): Promise<void> {
        const table = SchemaRegistry.getTable(RoleHasPermission);
        const conn = connection();
        await conn.delete(table).where(eq((table as any).roleId, role.id));

        const assignTable = SchemaRegistry.getTable(ModelHasRole);
        await conn.delete(assignTable).where(eq((assignTable as any).roleId, role.id));

        await role.delete();
        this.cache.flush();
    }

    // ---- Role <-> Permission (role.permissions) ----

    /** Grants `permission` to `role` (idempotent — a no-op if already granted). */
    async givePermissionToRole(role: Role, permission: Permission): Promise<void> {
        const already = await this.roleHasPermissionRow(role.id, permission.id);
        if (already) return;

        await RoleHasPermission.create({
            id: randomUUID(),
            roleId: role.id,
            permissionId: permission.id,
        } as any);
        this.cache.flush();
    }

    async revokePermissionFromRole(role: Role, permission: Permission): Promise<void> {
        const table = SchemaRegistry.getTable(RoleHasPermission);
        const conn = connection();
        await conn
            .delete(table)
            .where(and(eq((table as any).roleId, role.id), eq((table as any).permissionId, permission.id)));
        this.cache.flush();
    }

    /** Replaces ALL of a role's permissions with exactly this set. */
    async syncRolePermissions(role: Role, permissions: Permission[]): Promise<void> {
        const table = SchemaRegistry.getTable(RoleHasPermission);
        const conn = connection();
        await conn.delete(table).where(eq((table as any).roleId, role.id));

        for (const permission of permissions) {
            await conn.insert(table).values({
                id: randomUUID(),
                roleId: role.id,
                permissionId: permission.id,
            });
        }
        this.cache.flush();
    }

    private async roleHasPermissionRow(roleId: string, permissionId: string): Promise<boolean> {
        const rows = await RoleHasPermission.query()
            .where("roleId", roleId)
            .where("permissionId", permissionId)
            .get();
        return rows.length > 0;
    }

    // ---- Subject <-> Role (assignRole/removeRole/syncRoles) ----

    async assignRole(subject: Subject, role: Role): Promise<void> {
        const already = await this.subjectHasRoleRow(subject, role.id);
        if (already) return;

        await ModelHasRole.create({
            id: randomUUID(),
            roleId: role.id,
            modelType: subject.modelType,
            modelId: subject.modelId,
            teamId: subject.tenantId,
        } as any);
        this.cache.flushFor(subject);
    }

    async removeRole(subject: Subject, role: Role): Promise<void> {
        const table = SchemaRegistry.getTable(ModelHasRole);
        const conn = connection();
        await conn
            .delete(table)
            .where(
                and(
                    eq((table as any).roleId, role.id),
                    eq((table as any).modelType, subject.modelType),
                    eq((table as any).modelId, subject.modelId),
                    subject.tenantId ? eq((table as any).teamId, subject.tenantId) : isNull((table as any).teamId)
                )
            );
        this.cache.flushFor(subject);
    }

    /** Replaces ALL of a subject's roles (within its tenant scope) with exactly this set. */
    async syncRoles(subject: Subject, roles: Role[]): Promise<void> {
        const table = SchemaRegistry.getTable(ModelHasRole);
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

        for (const role of roles) {
            await conn.insert(table).values({
                id: randomUUID(),
                roleId: role.id,
                modelType: subject.modelType,
                modelId: subject.modelId,
                teamId: subject.tenantId,
            });
        }
        this.cache.flushFor(subject);
    }

    private async subjectHasRoleRow(subject: Subject, roleId: string): Promise<boolean> {
        const rows = await ModelHasRole.query()
            .where("roleId", roleId)
            .where("modelType", subject.modelType)
            .where("modelId", subject.modelId)
            .get();
        return subject.tenantId
            ? rows.some((r) => r.teamId === subject.tenantId)
            : rows.some((r) => !r.teamId);
    }

    /** Every Role currently assigned to `subject` (within its tenant scope). */
    async rolesFor(subject: Subject): Promise<Role[]> {
        const assignments = await ModelHasRole.query()
            .where("modelType", subject.modelType)
            .where("modelId", subject.modelId)
            .get();

        const scoped = subject.tenantId
            ? assignments.filter((a) => a.teamId === subject.tenantId)
            : assignments.filter((a) => !a.teamId);

        if (scoped.length === 0) return [];

        const roleIds = [...new Set(scoped.map((a) => a.roleId))];
        return Role.query().whereIn("id", roleIds).get();
    }
}
