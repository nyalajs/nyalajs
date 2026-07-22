import { Injectable } from "@nyalajs/core";
import { TenantResolver } from "./tenant-resolver.interface";

@Injectable()
export class HeaderTenantResolver implements TenantResolver {
    constructor(private readonly headerName: string = "x-tenant-id") { }

    async resolve(request: any): Promise<string | undefined> {
        return request.headers[this.headerName];
    }
}
