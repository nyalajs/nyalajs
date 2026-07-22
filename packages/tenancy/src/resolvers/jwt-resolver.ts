import { Injectable } from "@nyala/core";
import { TenantResolver } from "./tenant-resolver.interface";

@Injectable()
export class JwtTenantResolver implements TenantResolver {
    async resolve(request: any): Promise<string | undefined> {
        // Assumes JWT has already been parsed and attached to request
        const user = request.user;

        if (!user || !user.tenantId) {
            return undefined;
        }

        return user.tenantId;
    }
}
