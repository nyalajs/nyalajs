import "reflect-metadata";

const ROLE_OR_PERMISSION_METADATA = "nyala:permissions:role-or-permission";

export interface RoleOrPermissionRequirement {
    /** Each entry is either a role name or a permission name — a subject passes if it has ANY of these, checked as a role OR as a permission (mirrors Spatie's `role_or_permission:editor|posts.edit` middleware — a single OR list mixing both kinds). */
    names: string[];
}

/**
 * Passes if the subject has ANY of the given names as EITHER a role or a
 * permission — Spatie's `role_or_permission` middleware. Prefer @Roles() or
 * @Permissions() alone when you only need one kind of check; this exists
 * for the mixed case (e.g. "editors, OR anyone with the posts.edit
 * permission directly, whichever role they're in").
 *
 * @example
 *   @RoleOrPermission("editor", "posts.edit")
 *   @Put(":id")
 *   update() { ... }
 */
export function RoleOrPermission(...names: string[]): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        Reflect.defineMetadata(ROLE_OR_PERMISSION_METADATA, { names } as RoleOrPermissionRequirement, target.constructor, propertyKey);
        return descriptor;
    };
}

export function getRoleOrPermissionMetadata(target: any, propertyKey: string | symbol): RoleOrPermissionRequirement | undefined {
    return Reflect.getMetadata(ROLE_OR_PERMISSION_METADATA, target, propertyKey);
}
