import { Injectable } from "@nyalajs/core";
import { TenantResolver } from "./tenant-resolver.interface";

@Injectable()
export class SubdomainTenantResolver implements TenantResolver {
    async resolve(request: any): Promise<string | undefined> {
        const host = request.headers.host;

        if (!host) {
            return undefined;
        }

        // Extract subdomain from host (e.g., tenant1.app.com -> tenant1)
        const parts = host.split(".");

        if (parts.length < 3) {
            return undefined; // No subdomain
        }

        return parts[0];
    }
}
