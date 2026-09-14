import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { Injectable, TenantContext } from "@nyalajs/core";
import { Model, ConnectionContext, SchemaRegistry } from "@nyalajs/database";
import { eq, and } from "drizzle-orm";
import { TenantRecord } from "@nyalajs/tenancy";
import { BaseRepository } from "./base.repository";
import { User } from "../models/user.model";
import { findAcrossAllDatabases } from "../../database/cross-tenant-token-lookup";

/**
 * User Repository (Tenant-Aware)
 *
 * Normal queries go through User's own Model methods, which are
 * automatically scoped to the current tenant (TenantContext) — see Model's
 * own doc comment. The escape-hatch methods below intentionally bypass
 * that: login/refresh/accept-invite/password-reset all run BEFORE
 * TenantContext is set (see each method's own doc comment for why), so
 * there's nothing for Model's automatic scoping to key off yet.
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(User);
    }

    /** Find user by email (within current tenant) */
    async findByEmail(email: string): Promise<User | null> {
        return User.query().where("email", email).first();
    }

    /**
     * Find a user by email within an EXPLICITLY given tenant, bypassing
     * whatever TenantContext currently holds (or doesn't hold). Exists for
     * the one real case where you know which tenant to look in before
     * TenantContext has been (or ever will be) set for the current request
     * — namely login itself: the tenant is resolved FROM the login
     * request, so it can't already be sitting in TenantContext (see
     * AuthService.resolveTenantForLogin()). Runs the actual lookup inside
     * a fresh TenantContext.run() scoped to the GIVEN tenantId — never
     * touches or depends on whatever TenantContext was active on entry —
     * so Model's own automatic scoping does the filtering correctly
     * without this method having to hand-build a WHERE clause itself.
     */
    async findByEmailInTenant(email: string, tenantId: string): Promise<User | null> {
        return TenantContext.run(async () => {
            TenantContext.set(tenantId);
            return User.query().where("email", email).first();
        });
    }

    /**
     * Find a user by id with NO tenant filter at all. Exists for the one
     * real case where the caller doesn't have an active TenantContext yet
     * and genuinely doesn't need one — refresh-token exchange (see
     * AuthService.refreshToken()): the refresh token itself, once verified,
     * is proof enough of which user this is; a hostile caller can't forge
     * a valid signature for someone else's token, so there's no
     * cross-tenant leak risk in looking the user up by id directly.
     *
     * Drops to a raw query against Model's own connection (Model.db, or
     * ConnectionContext's override when a dedicated-tenant request happens
     * to be active) rather than User.find(id) — Model.find() ALWAYS applies
     * tenant scoping when the table has a tenantId column (see
     * Model.requireTenantScope(), no per-call bypass exists), so it can't
     * express "look this id up across every tenant" the way this method
     * needs to.
     */
    async findByIdAcrossTenants(id: string): Promise<User | null> {
        const table = SchemaRegistry.getTable(User);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        const results = await conn.select().from(table).where(eq(table.id, id)).limit(1);
        if (results.length === 0) return null;
        return Object.assign(new User(), results[0]);
    }

    /**
     * Same as findByIdAcrossTenants(), but ALSO checks every dedicated
     * tenant's own database when the shared one comes up empty — for
     * callers with no tenant identity of their own to route by directly
     * (email verification/password reset: their tokens carry a userId, not
     * a tenantId, so there's no way to know which database to check without
     * searching). Prefer findByIdAcrossTenants() directly whenever the
     * caller DOES already know which connection is active (e.g. inside
     * runForTenant() for a tenant you've already resolved) — this exists
     * specifically for the "don't know yet" case.
     */
    async findByIdAcrossAllDatabases(id: string): Promise<User | null> {
        return findAcrossAllDatabases(
            () => this.findByIdAcrossTenants(id),
            (dedicatedDb) => ConnectionContext.run(dedicatedDb, () => this.findByIdAcrossTenants(id))
        );
    }

    /**
     * Every user across EVERY tenant with this email — the same address
     * can legitimately have a separate account in more than one tenant
     * (e.g. someone who's a member of two different companies using this
     * app). "Forgot password" needs this: it doesn't know which tenant the
     * requester meant, so it resets/notifies every matching account. Same
     * raw-query reasoning as findByIdAcrossTenants() above.
     */
    async findAllByEmailAcrossTenants(email: string): Promise<User[]> {
        const table = SchemaRegistry.getTable(User);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        const results = await conn.select().from(table).where(eq(table.email, email));
        return results.map((row: any) => Object.assign(new User(), row));
    }

    /**
     * Same as findAllByEmailAcrossTenants(), but ALSO checks every
     * dedicated tenant's own database — unlike the single-user lookups
     * above, "forgot password" genuinely needs to accumulate matches from
     * EVERY database, not stop at the first one found (the same email can
     * have an account in more than one tenant, dedicated or not). See
     * findByIdAcrossAllDatabases()'s doc comment for the general reasoning.
     */
    async findAllByEmailAcrossAllDatabases(email: string): Promise<User[]> {
        const shared = await this.findAllByEmailAcrossTenants(email);

        const dedicatedTenants = await TenantRecord.query().where("isolationMode", "dedicated").get();
        const fromDedicated: User[] = [];
        for (const record of dedicatedTenants) {
            if (!record.connectionString) continue;
            const client = postgres(record.connectionString, { max: 1 });
            try {
                const dedicatedDb = drizzle(client);
                const found = await ConnectionContext.run(dedicatedDb, () => this.findAllByEmailAcrossTenants(email));
                fromDedicated.push(...found);
            } finally {
                await client.end();
            }
        }

        return [...shared, ...fromDedicated];
    }

    /**
     * Updates a user with NO tenant filter — same reasoning as
     * findByIdAcrossTenants(): a real caller (email verification, password
     * reset, login's lastLoginAt stamp) has already proven WHICH user via a
     * signed token/lookup before ever calling this, independent of whether
     * TenantContext happens to be set for the current request.
     */
    async rawUpdateAcrossTenants(id: string, data: Partial<User>): Promise<void> {
        const table = SchemaRegistry.getTable(User);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        await conn.update(table).set(data as any).where(eq(table.id, id));
    }

    /**
     * Creates a user with an EXPLICITLY given tenantId, bypassing
     * TenantContext entirely. Needed for accepting a team invite: that
     * endpoint is deliberately unauthenticated (the invited person has no
     * account yet — the invite token itself is the authorization), so
     * there's no JWT for TenantMiddleware to resolve a tenant from, and
     * TenantContext is never set for the request. The invite row (looked
     * up and validated by token before this is ever called) is what proves
     * which tenant the new user belongs to. Same TenantContext.run()
     * approach as findByEmailInTenant() — lets Model.create()'s own
     * tenant-stamping do the work correctly for the GIVEN tenant, without
     * touching whatever TenantContext was (or wasn't) active on entry.
     */
    async createAcrossTenants(data: Partial<User> & { tenantId: string }): Promise<User> {
        return TenantContext.run(async () => {
            TenantContext.set(data.tenantId);
            return User.create(data);
        });
    }

    /** Find active users in current tenant */
    async findActive(options?: { limit?: number; offset?: number }): Promise<User[]> {
        let query = User.query().where("isActive", true);
        if (options?.limit !== undefined) query = query.limit(options.limit);
        if (options?.offset !== undefined) query = query.offset(options.offset);
        return query.get();
    }

    /** Check if email exists in current tenant */
    async emailExists(email: string): Promise<boolean> {
        const user = await this.findByEmail(email);
        return user !== null;
    }

    /** Find users by role in current tenant */
    async findByRole(role: string): Promise<User[]> {
        return User.query().where("role", role).get();
    }

    /** Deactivate user */
    async deactivate(id: string): Promise<User | null> {
        return this.update(id, { isActive: false } as Partial<User>);
    }

    /** Activate user */
    async activate(id: string): Promise<User | null> {
        return this.update(id, { isActive: true } as Partial<User>);
    }
}
