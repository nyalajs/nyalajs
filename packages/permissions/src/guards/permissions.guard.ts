import { Inject, Injectable, Optional } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nyalajs/http";
import { UserIdentity } from "@nyalajs/security";
import { getPermissionsMetadata } from "../decorators/permissions.decorator";
import { PermissionService } from "../services/permission.service";
import { RoleService } from "../services/role.service";
import { Subject } from "../services/subject";
import { SUPER_ADMIN_ROLES } from "../config/super-admin.token";

/**
 * DB-backed permission check — expects AuthGuard (from @nyalajs/security)
 * to have already run and populated `context.context.metadata.get("user")`.
 * Unlike RolesGuard (which only ever checks role names embedded in the JWT
 * at issue time), this queries PermissionService live, so revoking a
 * permission takes effect on the subject's very next request — no token
 * re-issue needed. Register alongside AuthGuard:
 *
 *   @UseGuards(AuthGuard, PermissionsGuard)
 *   @Permissions("posts.delete")
 *   @Delete(":id")
 *   remove() { ... }
 *
 * Super-admin bypass: inject the SUPER_ADMIN_ROLES token (see
 * config/super-admin.token.ts) to name one or more role names that skip
 * every permission check unconditionally — mirrors Laravel's
 * `Gate::before(fn ($user) => $user->hasRole('super-admin') ? true : null)`
 * convention. Checked against the subject's DB-backed roles (RoleService),
 * not the JWT's `roles` claim — same live-not-cached-in-the-token
 * philosophy as the permission check itself: revoking someone's
 * super-admin role takes effect on their very next request.
 */
@Injectable()
export class PermissionsGuard implements Guard {
    constructor(
        private readonly permissionService: PermissionService,
        private readonly roleService: RoleService,
        @Optional() @Inject(SUPER_ADMIN_ROLES) private readonly superAdminRoles?: string[]
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const handler = context.route?.handlerName;
        const controller = context.route?.controller;
        if (!handler || !controller) return true;

        const requirement = getPermissionsMetadata(controller, handler);
        if (!requirement || requirement.names.length === 0) return true;

        const user = context.context.metadata.get("user") as UserIdentity | undefined;
        if (!user) throw new UnauthorizedException("Authentication required");

        const subject: Subject = {
            modelType: "User",
            modelId: user.userId,
            tenantId: user.tenantId,
        };

        if (this.superAdminRoles?.length) {
            const roles = await this.roleService.rolesFor(subject);
            if (roles.some((r) => this.superAdminRoles!.includes(r.name))) {
                return true;
            }
        }

        const allowed =
            requirement.mode === "all"
                ? await this.permissionService.hasAllPermissions(subject, requirement.names)
                : await this.permissionService.hasAnyPermission(subject, requirement.names);

        if (!allowed) {
            throw new ForbiddenException(
                `Missing required permission${requirement.names.length > 1 ? "s" : ""}: ${requirement.names.join(", ")}`
            );
        }

        return true;
    }
}
