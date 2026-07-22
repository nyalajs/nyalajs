import { Injectable, Inject } from "@nyala/core";
import { Guard, ExecutionContext, UnauthorizedException } from "@nyala/http";
import { JwtStrategy } from "./jwt-strategy";

@Injectable()
export class AuthGuard implements Guard {
    constructor(private readonly jwtStrategy: JwtStrategy) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.request;
        const token = this.extractToken(request);

        if (!token) {
            throw new UnauthorizedException("No authentication token provided");
        }

        const identity = await this.jwtStrategy.authenticate(token);

        if (!identity) {
            throw new UnauthorizedException("Invalid authentication token");
        }

        // Populate user context
        context.context.userId = identity.userId;
        context.context.tenantId = identity.tenantId;
        context.context.metadata.set("user", identity);

        return true;
    }

    private extractToken(request: any): string | null {
        const authHeader = request.headers.authorization;

        if (!authHeader) {
            return null;
        }

        const [type, token] = authHeader.split(" ");

        if (type !== "Bearer") {
            return null;
        }

        return token;
    }
}
