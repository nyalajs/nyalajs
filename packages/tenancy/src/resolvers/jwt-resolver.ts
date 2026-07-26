import { Injectable } from "@nyalajs/core";
import { JwtStrategy } from "@nyalajs/security";
import { TenantResolver } from "./tenant-resolver.interface";

/**
 * Resolves the tenant from the request's own JWT, independent of AuthGuard.
 * Tenant resolution runs as global middleware, before per-route guards, so it
 * cannot rely on AuthGuard having already populated anything — it decodes
 * and verifies the bearer token itself.
 */
@Injectable()
export class JwtTenantResolver implements TenantResolver {
    constructor(private readonly jwtStrategy: JwtStrategy) { }

    async resolve(request: any): Promise<string | undefined> {
        const token = this.extractToken(request);
        if (!token) return undefined;

        const identity = await this.jwtStrategy.authenticate(token);
        return identity?.tenantId;
    }

    private extractToken(request: any): string | null {
        const authHeader = request.headers?.authorization;
        if (!authHeader) return null;

        const [type, token] = authHeader.split(" ");
        return type === "Bearer" ? token : null;
    }
}
