import { Injectable } from "@nyalajs/core";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { tenants, Tenant } from "../models/tenant.model";

/**
 * Tenant Repository (NOT Tenant-Aware)
 *
 * Manages tenants themselves, so no tenant filtering is applied.
 * Used for tenant management operations.
 */
@Injectable()
export class TenantRepository extends BaseRepository<Tenant> {
    constructor() {
        super(tenants, false); // NOT tenant-aware
    }

    /**
     * Find tenant by slug
     */
    async findBySlug(slug: string): Promise<Tenant | null> {
        return this.findOne(eq(tenants.slug, slug));
    }

    /**
     * Find tenant by domain
     */
    async findByDomain(domain: string): Promise<Tenant | null> {
        return this.findOne(eq(tenants.domain, domain));
    }

    /**
     * Find active tenants
     */
    async findActive(options?: { limit?: number; offset?: number }): Promise<Tenant[]> {
        return this.findAll({
            ...options,
            where: eq(tenants.isActive, true),
        });
    }

    /**
     * Check if slug exists
     */
    async slugExists(slug: string): Promise<boolean> {
        const tenant = await this.findBySlug(slug);
        return tenant !== null;
    }

    /**
     * Deactivate tenant
     */
    async deactivate(id: string): Promise<Tenant | null> {
        return this.update(id, {
            isActive: false,
        } as Partial<Tenant>);
    }

    /**
     * Activate tenant
     */
    async activate(id: string): Promise<Tenant | null> {
        return this.update(id, {
            isActive: true,
        } as Partial<Tenant>);
    }

    /**
     * Update tenant plan
     */
    async updatePlan(id: string, plan: string): Promise<Tenant | null> {
        return this.update(id, {
            plan,
        } as Partial<Tenant>);
    }
}
