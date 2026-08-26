import { ProviderDefinition } from "@nyalajs/core";
import { CacheService } from "@nyalajs/cache";
import { PermissionCache } from "./services/permission-cache";
import { RoleService } from "./services/role.service";
import { PermissionService } from "./services/permission.service";
import { PermissionManager } from "./services/permission-manager";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RoleOrPermissionGuard } from "./guards/role-or-permission.guard";
import { DBRolesGuard } from "./guards/db-roles.guard";
import { SUPER_ADMIN_ROLES } from "./config/super-admin.token";

export interface PermissionsProvidersOptions {
    /** Role names that bypass every permission/role check unconditionally. Omit for no super-admin bypass at all. */
    superAdminRoles?: string[];
}

/**
 * Every provider this package needs, ready to spread into your own
 * @Module({ providers: [...] }) — this framework's @Module() only accepts
 * `imports: Type[]` (concrete module classes), not a NestJS-style dynamic
 * module object, so there is no `PermissionsModule.forRoot()` to import;
 * this plain function is the equivalent.
 *
 * @example
 *   @Module({
 *     providers: [
 *       ...permissionsProviders({ superAdminRoles: ["super-admin"] }),
 *       UsersService,
 *     ],
 *   })
 *   export class AppModule {}
 *
 * Each of RoleService/PermissionService/PermissionManager/PermissionsGuard/
 * DBRolesGuard/RoleOrPermissionGuard is independently @Injectable() too —
 * register only the ones you need directly instead, if you'd rather not
 * pull in the full set.
 */
export function permissionsProviders(options: PermissionsProvidersOptions = {}): ProviderDefinition[] {
    const providers: ProviderDefinition[] = [
        CacheService,
        PermissionCache,
        RoleService,
        PermissionService,
        PermissionManager,
        PermissionsGuard,
        RoleOrPermissionGuard,
        DBRolesGuard,
    ];

    if (options.superAdminRoles) {
        providers.push({ provide: SUPER_ADMIN_ROLES, useValue: options.superAdminRoles });
    }

    return providers;
}
