import { Injectable } from "@nyalajs/core";
import { TenantResolver } from "./tenant-resolver.interface";

/**
 * Resolves the tenant from a client-controlled header. This is only safe for
 * unauthenticated requests (e.g. picking a shard/subdomain before login) — a
 * request bearing an Authorization header must resolve its tenant from the
 * verified JWT (see JwtTenantResolver), never from a header the client could
 * spoof to access another tenant's data.
 */
@Injectable()
export class HeaderTenantResolver implements TenantResolver {
    constructor(private readonly headerName: string = "x-tenant-id") { }

    async resolve(request: any): Promise<string | undefined> {
        if (request.headers?.authorization) {
            return undefined;
        }

        return request.headers[this.headerName];
    }
}
