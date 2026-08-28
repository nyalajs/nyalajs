import { Injectable, TenantContext } from "@nyalajs/core";
import { BadRequestException, NotFoundException } from "@nyalajs/http";
import { Logger } from "@nyalajs/observability";
import { TenantRegistry, TenantMigrationService } from "@nyalajs/tenancy";
import { TenantRepository } from "../repositories/tenant.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import type { Tenant } from "../models/tenant.model";
import { User } from "../models/user.model";
import { TeamInvite } from "../models/team-invite.model";
import { Subscription } from "../models/subscription.model";
import { db } from "../../database/connection";
import { copyTenantRbacData } from "../../database/rbac-migration";

export interface UpdateTenantDto {
    name?: string;
    domain?: string;
}

/**
 * Every tenant-scoped Model class (has a `tenantId` column) this app
 * defines — the full list TenantMigrationService needs to know what to
 * actually copy when moving a tenant to (or back from) a dedicated
 * database. There is no auto-discovery (see MigrateToDedicatedOptions'
 * own doc comment on `models`); keep this in sync whenever you add a new
 * tenant-scoped Model.
 *
 * NOT included, and this matters: @nyalajs/permissions' Role/
 * ModelHasRole/ModelHasPermission/RoleHasPermission tables use `teamId`,
 * deliberately NOT `tenantId` (see Role's own doc comment — this is what
 * lets a team-scoped role coexist with @nyalajs/database's automatic
 * tenant-scoping without colliding with it). TenantMigrationService's copy
 * logic only recognizes a literal `tenantId` column, so it can't see or
 * copy RBAC data at all — migrateToDedicated() below copies it separately,
 * via database/rbac-migration.ts's own raw-SQL copy (see that file's doc
 * comment for the full reasoning).
 */
const TENANT_SCOPED_MODELS = [User, TeamInvite, Subscription];

@Injectable()
export class TenantsService {
    constructor(
        private readonly tenantRepository: TenantRepository,
        private readonly tenantRegistry: TenantRegistry,
        private readonly tenantMigrationService: TenantMigrationService,
        private readonly refreshTokenRepository: RefreshTokenRepository,
        private readonly logger: Logger
    ) {}

    /** The current request's own tenant (from TenantContext — set by TenantMiddleware from the authenticated user's JWT). */
    async getCurrent(): Promise<Tenant> {
        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new BadRequestException("No active tenant for this request.");
        }
        const tenant = await this.tenantRepository.findById(tenantId);
        if (!tenant) {
            throw new NotFoundException("Tenant not found");
        }
        return tenant;
    }

    async update(dto: UpdateTenantDto): Promise<Tenant> {
        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new BadRequestException("No active tenant for this request.");
        }

        if (dto.domain) {
            const existing = await this.tenantRepository.findByDomain(dto.domain);
            if (existing && existing.id !== tenantId) {
                throw new BadRequestException("This domain is already in use by another workspace.");
            }
        }

        const updated = await this.tenantRepository.update(tenantId, {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.domain !== undefined && { domain: dto.domain }),
        } as Partial<Tenant>);

        if (!updated) {
            throw new NotFoundException("Tenant not found");
        }
        return updated;
    }

    /**
     * Moves the current tenant's data to its own dedicated database. Three
     * real steps, in order:
     *
     *   1. TenantMigrationService copies every table in TENANT_SCOPED_MODELS
     *      (provisions the target schema, copies rows in batches, verifies
     *      counts) and — only once that's verified — atomically flips
     *      TenantRegistry's isolation mode. No live traffic routes to the
     *      target until this line completes; anything after it operates on
     *      an ALREADY-dedicated, already-routed-to tenant.
     *   2. copyTenantRbacData() separately copies this tenant's roles/
     *      permission grants — TenantMigrationService can't see them at all
     *      (see TENANT_SCOPED_MODELS' own doc comment on why), so without
     *      this, every RBAC-gated route (DBRolesGuard/@Roles()) would 500
     *      immediately after cutover — reproduced against a real migration.
     *   3. Every existing refresh token for this tenant's users is revoked.
     *      refresh_tokens has no tenantId at all (looked up globally by
     *      token value, see RefreshTokenRepository's own doc comment) and
     *      is deliberately NOT migrated/duplicated — simpler and safer than
     *      trying to keep a session token valid across two different
     *      databases. Users on this tenant will need to sign in again once;
     *      their access tokens keep working until they naturally expire.
     *
     * `connectionString` must point at an already-reachable, empty(-ish)
     * Postgres database you provisioned yourself — this never creates the
     * database itself, only the tables inside it.
     *
     * Every tenant starts unregistered in TenantRegistry (this app creates
     * tenants via AuthService.register(), which has no reason to touch the
     * registry for the common case — nearly every tenant stays "shared"
     * forever) — lazily registers it here, defaulting to "shared", the
     * first time a tenant is actually migrated.
     */
    async migrateToDedicated(
        connectionString: string
    ): Promise<{ tenantId: string; tablesCopied: string[]; rowsCopied: number; rolesCopied: number; permissionGrantsCopied: number; sessionsRevoked: boolean }> {
        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new BadRequestException("No active tenant for this request.");
        }

        const tenant = await this.tenantRepository.findById(tenantId);
        if (!tenant) {
            throw new NotFoundException("Tenant not found");
        }

        const existingRecord = await this.tenantRegistry.find(tenantId);
        if (!existingRecord) {
            await this.tenantRegistry.register({ id: tenantId, name: tenant.name, isolationMode: "shared" });
        }

        this.logger.info("Starting shared -> dedicated migration", { tenantId });

        const result = await this.tenantMigrationService.migrateToDedicated({
            tenantId,
            connectionString,
            driver: "postgres",
            models: TENANT_SCOPED_MODELS,
        });

        const rbacResult = await copyTenantRbacData(db, connectionString, tenantId);

        // Not scoped by TenantContext — refresh tokens were never
        // tenant-scoped in the first place (see the class doc comment
        // above), so this reads/writes the SHARED database directly via
        // the same raw-query pattern RefreshTokenRepository's own bulk
        // methods use, filtered by each affected user's id instead.
        const migratedUsers = await User.query().get();
        for (const user of migratedUsers) {
            await this.refreshTokenRepository.revokeAllForUser(user.id);
        }

        this.logger.info("Completed shared -> dedicated migration", {
            tenantId,
            tablesCopied: result.tablesCopied,
            rowsCopied: result.rowsCopied,
            rolesCopied: rbacResult.rolesCopied,
            permissionGrantsCopied: rbacResult.permissionGrantsCopied,
        });

        return {
            ...result,
            rolesCopied: rbacResult.rolesCopied,
            permissionGrantsCopied: rbacResult.permissionGrantsCopied,
            sessionsRevoked: true,
        };
    }

    /** Current isolation mode ("shared" | "dedicated") for the active tenant — "shared" for any tenant never registered at all (the common case, see migrateToDedicated()'s doc comment). */
    async getIsolationStatus(): Promise<{ isolationMode: "shared" | "dedicated"; migrationStatus: string }> {
        const tenantId = TenantContext.get();
        if (!tenantId) {
            throw new BadRequestException("No active tenant for this request.");
        }

        const record = await this.tenantRegistry.find(tenantId);
        if (!record) {
            return { isolationMode: "shared", migrationStatus: "none" };
        }
        return { isolationMode: record.isolationMode, migrationStatus: record.migrationStatus };
    }
}
