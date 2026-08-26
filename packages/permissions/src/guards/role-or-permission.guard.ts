import { Inject, Injectable, Optional } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nyalajs/http";
import { UserIdentity } from "@nyalajs/security";
import { getRoleOrPermissionMetadata } from "../decorators/role-or-permission.decorator";
import { PermissionService } from "../services/permission.service";
import { RoleService } from "../services/role.service";
import { Subject } from "../services/subject";
import { SUPER_ADMIN_ROLES } from "../config/super-admin.token";

/**
 * Backs @RoleOrPermission() — see that file for the full contract. Both
 * halves of the check (role AND permission) are DB-backed live, via
 * RoleService/PermissionService, same as DBRolesGuard/PermissionsGuard —
 * NOT the JWT-claims-only roles RolesGuard reads, for the same reason
 * DBRolesGuard exists: a role revoked mid-session takes effect immediately
 * here, not only after the subject's token is re-issued.
 */
@Injectable()
export class RoleOrPermissionGuard implements Guard {
    constructor(
        private readonly roleService: RoleService,
        private readonly permissionService: PermissionService,
        @Optional() @Inject(SUPER_ADMIN_ROLES) private readonly superAdminRoles?: string[]
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const handler = context.route?.handlerName;
        const controller = context.route?.controller;
        if (!handler || !controller) return true;

        const requirement = getRoleOrPermissionMetadata(controller, handler);
        if (!requirement || requirement.names.length === 0) return true;

        const user = context.context.metadata.get("user") as UserIdentity | undefined;
        if (!user) throw new UnauthorizedException("Authentication required");

        const subject: Subject = { modelType: "User", modelId: user.userId, tenantId: user.tenantId };
        const roles = await this.roleService.rolesFor(subject);
        const roleNames = roles.map((r) => r.name);

        if (this.superAdminRoles?.length && roleNames.some((r) => this.superAdminRoles!.includes(r))) {
            return true;
        }

        const hasMatchingRole = requirement.names.some((name) => roleNames.includes(name));
        if (hasMatchingRole) return true;

        const hasMatchingPermission = await this.permissionService.hasAnyPermission(subject, requirement.names);
        if (hasMatchingPermission) return true;

        throw new ForbiddenException(`Missing required role or permission: ${requirement.names.join(", ")}`);
    }
}
