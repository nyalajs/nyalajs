import { Injectable, Inject, TenantContext, LogContext } from "@nyalajs/core";
import { NextFunction, BadRequestException } from "@nyalajs/http";
import { TenantResolver } from "../resolvers/tenant-resolver.interface";

/**
 * Global middleware (use(req, res, next) — same contract as every other
 * Middleware) that resolves the current tenant and publishes it via
 * TenantContext, so it's visible to guards, handlers, and the ORM's
 * automatic tenant-scoping for the rest of the request.
 */
@Injectable()
export class TenantMiddleware {
    constructor(
        @Inject("TENANT_RESOLVERS") private readonly resolvers: TenantResolver[],
        @Inject("TENANT_REQUIRED") private readonly required: boolean = false
    ) { }

    async use(req: any, res: any, next: NextFunction): Promise<void> {
        // Try each resolver in order
        for (const resolver of this.resolvers) {
            const tenantId = await resolver.resolve(req);

            if (tenantId) {
                TenantContext.set(tenantId);
                LogContext.set({ tenantId });
                break;
            }
        }

        // If tenant is required but not found, throw error
        if (this.required && !TenantContext.get()) {
            throw new BadRequestException("Tenant context required but not found");
        }

        await next();
    }
}
