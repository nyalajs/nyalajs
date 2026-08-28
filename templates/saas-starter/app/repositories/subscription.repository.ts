import { Injectable, TenantContext } from "@nyalajs/core";
import { Model, ConnectionContext, SchemaRegistry } from "@nyalajs/database";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { Subscription } from "../models/subscription.model";

/**
 * Subscription Repository (NOT tenant-aware, despite Subscription's Model
 * having a `tenantId` column)
 *
 * Billing webhook handlers receive events keyed by the GATEWAY's own
 * reference (a Stripe checkout session id, etc.), not by tenant — there's
 * no active TenantContext at all when a webhook arrives (it's an
 * unauthenticated, gateway-to-server call, not a request from one of your
 * own users). Every method here either runs a raw query against Model's
 * own connection (bypassing Model's automatic TenantContext-based scoping
 * entirely, which would otherwise throw with no context active) or scopes
 * explicitly via TenantContext.run() for a KNOWN tenantId — same escape-
 * hatch pattern as UserRepository's pre-tenant-context methods.
 */
@Injectable()
export class SubscriptionRepository extends BaseRepository<Subscription> {
    constructor() {
        super(Subscription);
    }

    async findByTenantId(tenantId: string): Promise<Subscription | null> {
        return TenantContext.run(async () => {
            TenantContext.set(tenantId);
            return Subscription.query().first();
        });
    }

    async findByGatewayReference(gatewayReference: string): Promise<Subscription | null> {
        const table = SchemaRegistry.getTable(Subscription);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        const results = await conn.select().from(table).where(eq(table.gatewayReference, gatewayReference)).limit(1);
        if (results.length === 0) return null;
        return Object.assign(new Subscription(), results[0]);
    }

    /** Creates the subscription row if this tenant doesn't have one yet, otherwise updates it — a tenant has exactly one subscription row (see the migration's UNIQUE constraint), this is the one write path that respects that. */
    async upsertForTenant(tenantId: string, data: Partial<Subscription>): Promise<Subscription> {
        return TenantContext.run(async () => {
            TenantContext.set(tenantId);
            const existing = await Subscription.query().first();
            if (existing) {
                Object.assign(existing, data);
                await existing.save();
                return existing;
            }
            return Subscription.create({ tenantId, ...data } as Partial<Subscription>);
        });
    }
}
