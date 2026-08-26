/**
 * DI token for the list of role names that bypass every permission/role
 * check unconditionally — the super-admin escape hatch every RBAC system
 * needs (Laravel: `Gate::before`). Register it as a plain value provider:
 *
 *   @Module({
 *     providers: [
 *       { provide: SUPER_ADMIN_ROLES, useValue: ["super-admin"] },
 *     ],
 *   })
 *
 * Optional — PermissionsGuard/RoleOrPermissionGuard/PolicyGuard-integration
 * all treat an unregistered token the same as an empty list (no bypass).
 */
export const SUPER_ADMIN_ROLES = "NYALA_PERMISSIONS_SUPER_ADMIN_ROLES";
