import { Injectable } from "@nyalajs/core";
import { RoleService } from "./role.service";
import { PermissionService } from "./permission.service";
import { Role } from "../models/role.model";
import { Permission } from "../models/permission.model";
import { Subject, subjectFor } from "./subject";
import { matchesPermission } from "./permission-matcher";

export interface HasRolesOptions {
    guardName?: string;
    tenantId?: string;
}

/**
 * The single DI-injectable entry point most application code should use —
 * a TypeScript stand-in for Spatie's HasRoles/HasPermissions Eloquent
 * traits (TS classes can't mix in traits the way PHP does, so this is a
 * companion service instead of a User-model method set). Wraps
 * RoleService + PermissionService behind the exact Spatie method names,
 * operating on any {id: string|number} model instance.
 *
 * @example
 *   constructor(private permissions: PermissionManager) {}
 *
 *   async promote(user: User) {
 *     await this.permissions.assignRole(user, "editor");
 *   }
 *
 *   async canPublish(user: User) {
 *     return this.permissions.can(user, "posts.publish");
 *   }
 */
@Injectable()
export class PermissionManager {
    constructor(
        private readonly roleService: RoleService,
        private readonly permissionService: PermissionService
    ) {}

    private subject(model: { id: string | number }, modelType: string, options: HasRolesOptions): Subject {
        return subjectFor(modelType, model, options);
    }

    // ---- Roles ----

    async assignRole(model: { id: string | number }, roleName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<void> {
        const role = await this.roleService.findOrCreate(roleName, options);
        await this.roleService.assignRole(this.subject(model, modelType, options), role);
    }

    async removeRole(model: { id: string | number }, roleName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<void> {
        const role = await this.roleService.findByName(roleName, options);
        if (!role) return;
        await this.roleService.removeRole(this.subject(model, modelType, options), role);
    }

    /** Replaces ALL of the model's roles with exactly the named set — roles not in `roleNames` are removed, missing ones are created. */
    async syncRoles(model: { id: string | number }, roleNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<void> {
        const roles = await Promise.all(roleNames.map((name) => this.roleService.findOrCreate(name, options)));
        await this.roleService.syncRoles(this.subject(model, modelType, options), roles);
    }

    async getRoleNames(model: { id: string | number }, options: HasRolesOptions = {}, modelType = "User"): Promise<string[]> {
        const roles = await this.roleService.rolesFor(this.subject(model, modelType, options));
        return roles.map((r) => r.name);
    }

    async hasRole(model: { id: string | number }, roleName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const names = await this.getRoleNames(model, options, modelType);
        return names.includes(roleName);
    }

    async hasAnyRole(model: { id: string | number }, roleNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const names = await this.getRoleNames(model, options, modelType);
        return roleNames.some((r) => names.includes(r));
    }

    async hasAllRoles(model: { id: string | number }, roleNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const names = await this.getRoleNames(model, options, modelType);
        return roleNames.every((r) => names.includes(r));
    }

    /** True if the model has EXACTLY these roles — no more, no fewer. Mirrors Spatie's hasExactRoles(). */
    async hasExactRoles(model: { id: string | number }, roleNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const names = await this.getRoleNames(model, options, modelType);
        if (names.length !== roleNames.length) return false;
        const want = new Set(roleNames);
        return names.every((n) => want.has(n));
    }

    // ---- Permissions (direct grants) ----

    async givePermissionTo(model: { id: string | number }, permissionName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<void> {
        const permission = await this.permissionService.findOrCreate(permissionName, options);
        await this.permissionService.givePermissionTo(this.subject(model, modelType, options), permission);
    }

    async revokePermissionTo(model: { id: string | number }, permissionName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<void> {
        const permission = await this.permissionService.findByName(permissionName, options);
        if (!permission) return;
        await this.permissionService.revokePermissionFrom(this.subject(model, modelType, options), permission);
    }

    /** Replaces ALL of the model's DIRECT permission grants (not role-derived ones). */
    async syncPermissions(model: { id: string | number }, permissionNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<void> {
        const permissions = await Promise.all(permissionNames.map((name) => this.permissionService.findOrCreate(name, options)));
        await this.permissionService.syncPermissions(this.subject(model, modelType, options), permissions);
    }

    async getDirectPermissionNames(model: { id: string | number }, options: HasRolesOptions = {}, modelType = "User"): Promise<string[]> {
        return this.permissionService.getDirectPermissionNames(this.subject(model, modelType, options));
    }

    async getPermissionNamesViaRoles(model: { id: string | number }, options: HasRolesOptions = {}, modelType = "User"): Promise<string[]> {
        return this.permissionService.getPermissionNamesViaRoles(this.subject(model, modelType, options));
    }

    /** Every effective permission name (direct + via roles), deduplicated. Mirrors Spatie's getAllPermissions() (there it returns Permission models; here, names — use findByName() if you need the row). */
    async getAllPermissions(model: { id: string | number }, options: HasRolesOptions = {}, modelType = "User"): Promise<string[]> {
        return this.permissionService.getAllPermissionNames(this.subject(model, modelType, options));
    }

    /** Alias for hasPermissionTo() — shorter spelling for the most common call site. */
    async can(model: { id: string | number }, permissionName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        return this.hasPermissionTo(model, permissionName, options, modelType);
    }

    async hasPermissionTo(model: { id: string | number }, permissionName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        return this.permissionService.hasPermissionTo(this.subject(model, modelType, options), permissionName);
    }

    async hasAnyPermission(model: { id: string | number }, permissionNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        return this.permissionService.hasAnyPermission(this.subject(model, modelType, options), permissionNames);
    }

    async hasAllPermissions(model: { id: string | number }, permissionNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        return this.permissionService.hasAllPermissions(this.subject(model, modelType, options), permissionNames);
    }

    /** True only if `permissionName` is granted DIRECTLY (bypasses roles entirely) — mirrors Spatie's hasDirectPermission(). */
    async hasDirectPermission(model: { id: string | number }, permissionName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const direct = await this.getDirectPermissionNames(model, options, modelType);
        return this.matches(direct, permissionName);
    }

    async hasAnyDirectPermission(model: { id: string | number }, permissionNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const direct = await this.getDirectPermissionNames(model, options, modelType);
        return permissionNames.some((name) => this.matches(direct, name));
    }

    async hasAllDirectPermissions(model: { id: string | number }, permissionNames: string[], options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const direct = await this.getDirectPermissionNames(model, options, modelType);
        return permissionNames.every((name) => this.matches(direct, name));
    }

    /** True only if `permissionName` is granted VIA A ROLE (ignores direct grants) — mirrors Spatie's hasPermissionViaRole(). */
    async hasPermissionViaRole(model: { id: string | number }, permissionName: string, options: HasRolesOptions = {}, modelType = "User"): Promise<boolean> {
        const viaRoles = await this.getPermissionNamesViaRoles(model, options, modelType);
        return this.matches(viaRoles, permissionName);
    }

    /** True if `permissionName` matches any of the model's granted permission names, honoring wildcards, WITHOUT hitting the cache/DB again — useful when you already have the granted list (e.g. from getAllPermissions()) and are checking several names against it in a loop. */
    matches(grantedNames: string[], permissionName: string): boolean {
        return grantedNames.some((granted) => matchesPermission(granted, permissionName));
    }
}
