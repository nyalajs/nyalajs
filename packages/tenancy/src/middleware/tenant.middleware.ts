import { Injectable, Inject } from "@nyala/core";
import { ExecutionContext, BadRequestException } from "@nyala/http";
import { TenantResolver } from "../resolvers/tenant-resolver.interface";

@Injectable()
export class TenantMiddleware {
    constructor(
        @Inject("TENANT_RESOLVERS") private readonly resolvers: TenantResolver[],
        @Inject("TENANT_REQUIRED") private readonly required: boolean = false
    ) { }

    async use(ctx: ExecutionContext, next: () => Promise<void>): Promise<void> {
        // Try each resolver in order
        for (const resolver of this.resolvers) {
            const tenantId = await resolver.resolve(ctx.request);

            if (tenantId) {
                ctx.context.tenantId = tenantId;
                break;
            }
        }

        // If tenant is required but not found, throw error
        if (this.required && !ctx.context.tenantId) {
            throw new BadRequestException("Tenant context required but not found");
        }

        await next();
    }
}
