import "reflect-metadata";

const PERMISSIONS_METADATA = "nyala:permissions:required";

export type PermissionMatchMode = "any" | "all";

export interface PermissionRequirement {
    names: string[];
    mode: PermissionMatchMode;
}

/**
 * Declares which permission(s) a route requires — DB-backed (via
 * PermissionsGuard), unlike @Roles()/RolesGuard which only ever checks the
 * roles embedded in a JWT at issue time. Supports wildcard names ("posts.*")
 * the same way the underlying PermissionService does.
 *
 * @example
 *   @Permissions("posts.delete")
 *   @Delete(":id")
 *   remove() { ... }
 *
 * @example multiple, ANY matches (default)
 *   @Permissions("posts.delete", "posts.moderate")
 *   @Delete(":id")
 *   remove() { ... }
 *
 * @example multiple, ALL required
 *   @Permissions(["posts.publish", "posts.review"], { mode: "all" })
 *   @Post(":id/publish")
 *   publish() { ... }
 */
export function Permissions(
    names: string | string[],
    options: { mode?: PermissionMatchMode } = {}
): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        const requirement: PermissionRequirement = {
            names: Array.isArray(names) ? names : [names],
            mode: options.mode ?? "any",
        };
        // Same metadata-on-constructor convention as @Roles() (roles.decorator.ts)
        // and every other Nyala route decorator — deliberately NOT `.prototype`.
        Reflect.defineMetadata(PERMISSIONS_METADATA, requirement, target.constructor, propertyKey);
        return descriptor;
    };
}

export function getPermissionsMetadata(target: any, propertyKey: string | symbol): PermissionRequirement | undefined {
    return Reflect.getMetadata(PERMISSIONS_METADATA, target, propertyKey);
}
