import { Injectable, Inject, Optional, TenantContext, LogContext } from "@nyalajs/core";
import { ConnectionContext } from "@nyalajs/database";
import { NextFunction, BadRequestException } from "@nyalajs/http";
import { TenantResolver } from "../resolvers/tenant-resolver.interface";
import { TenantRegistry } from "../registry/tenant-registry.service";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";

/**
 * Global middleware (use(req, res, next) — same contract as every other
 * Middleware) that resolves the current tenant and publishes it via
 * TenantContext, so it's visible to guards, handlers, and the ORM's
 * automatic tenant-scoping for the rest of the request.
 *
 * When a TenantRegistry is wired in (the 3rd/4th constructor args), it also
 * looks up the resolved tenant's isolation mode: for a "dedicated" tenant it
 * gets/opens that tenant's own connection via TenantConnectionManager and
 * runs the REST OF THE REQUEST inside ConnectionContext.run(), so every
 * @nyalajs/database Model call for this request transparently targets that
 * tenant's own database — no repository/handler code has to know or care.
 * A "shared" tenant (or no registry configured at all) behaves exactly as
 * before: TenantContext is set, Model uses the app's normal global
 * connection, and row-level tenant_id scoping does the isolation.
 */
@Injectable()
export class TenantMiddleware {
    constructor(
        @Inject("TENANT_RESOLVERS") private readonly resolvers: TenantResolver[],
        @Inject("TENANT_REQUIRED") private readonly required: boolean = false,
        @Optional() private readonly registry?: TenantRegistry,
        @Optional() private readonly connections?: TenantConnectionManager
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

        const tenantId = TenantContext.get();
        if (tenantId && this.registry && this.connections) {
            await this.routeByIsolationMode(tenantId, next);
            return;
        }

        await next();
    }

    private async routeByIsolationMode(tenantId: string, next: NextFunction): Promise<void> {
        const record = await this.registry!.find(tenantId);

        // Unknown to the registry (e.g. an app that registers tenants lazily,
        // or a tenant id from a resolver that isn't registry-backed at all)
        // falls back to shared/global-connection behavior, same as if no
        // registry were configured — never blocks the request over this.
        if (!record || record.isolationMode !== "dedicated") {
            await next();
            return;
        }

        const db = await this.connections!.getConnection(record);
        await ConnectionContext.run(db, next);
    }
}
