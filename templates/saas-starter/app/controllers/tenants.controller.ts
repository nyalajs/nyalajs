import { Controller, Get, Put, Post, Body, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { AuthGuard, Roles } from "@nyalajs/security";
import { DBRolesGuard } from "@nyalajs/permissions";
import { TenantsService, UpdateTenantDto } from "../services/tenants.service";
import { UpdateTenantValidator, MigrateToDedicatedValidator } from "../validators/tenant.validator";

/**
 * Self-service settings for the CURRENT (authenticated) tenant — renaming
 * the workspace, setting a custom domain. Deliberately does NOT expose
 * `plan`/`isActive` here even though UpdateTenantValidator's full schema
 * allows them: those only ever change through a real subscription-status
 * webhook (see BillingController) or a platform-admin action, never a
 * self-service PUT from a tenant's own admin — `.pick()` restricts the
 * validated fields to exactly what THIS endpoint should accept, even
 * though the shared validator's schema is broader.
 */
@Controller("/tenant")
@UseGuards(AuthGuard)
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) {}

    @Get("/")
    async getCurrent() {
        return this.tenantsService.getCurrent();
    }

    // @UseGuards() at method level REPLACES the class-level list entirely
    // (see MetadataScanner.getGuards()'s own doc comment — "method
    // overrides class", not merge) — AuthGuard must be repeated here, or
    // DBRolesGuard runs with no authenticated identity at all and every
    // request 401s with "Authentication required" regardless of a valid
    // token. Reproduced against a real request before this fix.
    @Put("/")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner", "admin")
    @ValidateBody(UpdateTenantValidator.pick({ name: true, domain: true }))
    async update(@Body() dto: UpdateTenantDto) {
        return this.tenantsService.update(dto);
    }

    /** Current isolation mode ("shared" | "dedicated") — any authenticated member can check, same visibility as GET /. */
    @Get("/isolation-status")
    async isolationStatus() {
        return this.tenantsService.getIsolationStatus();
    }

    /**
     * Moves the current tenant's data to its own dedicated Postgres
     * database — owner-only (stricter than the regular owner/admin PUT
     * above): this is a real, consequential infrastructure operation, not
     * a settings change, and its `connectionString` body param is
     * effectively a secret being handed to the server. See
     * TenantsService.migrateToDedicated()'s doc comment for the real
     * mechanics and its current RBAC-data limitation.
     */
    @Post("/migrate-to-dedicated")
    @UseGuards(AuthGuard, DBRolesGuard)
    @Roles("owner")
    @ValidateBody(MigrateToDedicatedValidator)
    async migrateToDedicated(@Body("connectionString") connectionString: string) {
        return this.tenantsService.migrateToDedicated(connectionString);
    }
}
