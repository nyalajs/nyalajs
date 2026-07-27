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

        // @Roles() (roles.decorator.ts) stores metadata on the controller
        // *class* (target.constructor), not `.prototype` — a different
        // object, which would always come back empty and fail this guard
        // open regardless of any @Roles() actually being declared.
        const requiredRoles = getRolesMetadata(controller, handler);

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
