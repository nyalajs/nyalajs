import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext, ForbiddenException } from "@nyalajs/http";
import { getRolesMetadata } from "./roles.decorator";

@Injectable()
export class RolesGuard implements Guard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const handler = context.route?.handlerName;
        const controller = context.route?.controller;

        if (!handler || !controller) {
            return true;
        }

        const requiredRoles = getRolesMetadata(controller.prototype, handler);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true; // No roles required
        }

        const user = context.context.metadata.get("user");

        if (!user || !user.roles) {
            throw new ForbiddenException("User roles not found");
        }

        const hasRole = requiredRoles.some((role) => user.roles.includes(role));

        if (!hasRole) {
            throw new ForbiddenException(
                `User does not have required roles: ${requiredRoles.join(", ")}`
            );
        }

        return true;
    }
}
