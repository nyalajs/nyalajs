import { Inject, Injectable, Optional } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException, UnauthorizedException } from "@nyalajs/http";
import { getRolesMetadata, UserIdentity } from "@nyalajs/security";
import { RoleService } from "../services/role.service";
import { Subject } from "../services/subject";
import { SUPER_ADMIN_ROLES } from "../config/super-admin.token";

/**
 * Drop-in replacement for @nyalajs/security's RolesGuard, reading the SAME
 * @Roles() decorator metadata but checking the database live instead of the
 * role names baked into the JWT at login time. Revoking a role takes effect
 * on the subject's very next request — no re-login/token-refresh needed,
 * unlike RolesGuard.
 *
 *   @UseGuards(AuthGuard, DBRolesGuard)   // swap RolesGuard for DBRolesGuard
 *   @Roles("admin")                        // decorator itself is unchanged
 *   @Delete(":id")
 *   remove() { ... }
 *
 * A user only needs ONE of the listed roles to pass (`.some()`, matching
 * RolesGuard's own semantics) — use @Permissions() with { mode: "all" }
 * instead if you need an AND across multiple checks.
 */
@Injectable()
export class DBRolesGuard implements Guard {
    constructor(
        private readonly roleService: RoleService,
        @Optional() @Inject(SUPER_ADMIN_ROLES) private readonly superAdminRoles?: string[]
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const handler = context.route?.handlerName;
        const controller = context.route?.controller;
        if (!handler || !controller) return true;

        const requiredRoles = getRolesMetadata(controller, handler);
        if (!requiredRoles || requiredRoles.length === 0) return true;

        const user = context.context.metadata.get("user") as UserIdentity | undefined;
        if (!user) throw new UnauthorizedException("Authentication required");

        const subject: Subject = { modelType: "User", modelId: user.userId, tenantId: user.tenantId };
        const roles = await this.roleService.rolesFor(subject);
        const roleNames = roles.map((r) => r.name);

        if (this.superAdminRoles?.length && roleNames.some((r) => this.superAdminRoles!.includes(r))) {
            return true;
        }

        const hasRole = requiredRoles.some((role) => roleNames.includes(role));
        if (!hasRole) {
            throw new ForbiddenException(`User does not have required roles: ${requiredRoles.join(", ")}`);
        }

        return true;
    }
}
