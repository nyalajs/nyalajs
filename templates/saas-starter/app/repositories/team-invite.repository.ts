import { Injectable } from "@nyalajs/core";
import { Model, ConnectionContext, SchemaRegistry } from "@nyalajs/database";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { TeamInvite } from "../models/team-invite.model";
import { findAcrossAllDatabases } from "../../database/cross-tenant-token-lookup";

/**
 * Team Invite Repository (Tenant-Aware)
 *
 * Listing/creating invites always happens within an authenticated,
 * tenant-scoped request (an admin managing their own team), so this uses
 * the normal TenantContext-scoped Model path — unlike
 * User/RefreshToken/EmailVerificationToken, there's no pre-tenant-context
 * lookup case here: ACCEPTING an invite (findValidByToken below) is
 * deliberately the one exception, since a brand-new user clicking an email
 * link has no session/tenant context at all yet. markAccepted() bypasses
 * tenant scoping the same way for the same reason — it's called from
 * acceptInvite(), which never has an active TenantContext.
 */
@Injectable()
export class TeamInviteRepository extends BaseRepository<TeamInvite> {
    constructor() {
        super(TeamInvite);
    }

    /**
     * A pending, unexpired invite by its token — bypasses TenantContext,
     * since accepting an invite is how a brand-new user FIRST gets any
     * tenant context at all.
     *
     * Checks BOTH the shared database and every dedicated tenant's own
     * database (via findAcrossAllDatabases() — see its own doc comment for
     * why this is unavoidable): the invite's own tenant might already be
     * dedicated by the time someone clicks the invite link, and there's no
     * tenant identity yet at this point in the request to route by any
     * other way. Confirmed against a real dedicated tenant: without this,
     * a genuinely valid, unexpired invite token for that tenant's own
     * database returned "invalid or expired" because only the shared
     * database was ever checked.
     */
    async findValidByToken(token: string): Promise<TeamInvite | null> {
        const table = SchemaRegistry.getTable(TeamInvite);

        const checkOne = async (conn: any): Promise<TeamInvite | null> => {
            const results = await conn.select().from(table).where(eq(table.token, token)).limit(1);
            const row = results[0];
            if (!row || row.status !== "pending") return null;
            if (new Date(row.expiresAt) < new Date()) return null;
            return Object.assign(new TeamInvite(), row);
        };

        return findAcrossAllDatabases(
            () => checkOne(ConnectionContext.get() ?? (Model as any).db),
            (dedicatedDb) => checkOne(dedicatedDb)
        );
    }

    /**
     * No TenantContext at call time (see class doc comment) — raw update
     * against WHATEVER connection is active when this is called (the
     * shared pool, or — if TeamService.acceptInvite() has wrapped the rest
     * of the flow in ConnectionContext.run() for a dedicated tenant, see
     * that method's own doc comment — the tenant's own dedicated
     * connection). Same reasoning as UserRepository.rawUpdateAcrossTenants().
     */
    async markAccepted(id: string): Promise<void> {
        const table = SchemaRegistry.getTable(TeamInvite);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        await conn.update(table).set({ status: "accepted", acceptedAt: new Date() }).where(eq(table.id, id));
    }

    /** Called from an authenticated, tenant-scoped route (revokeInvite) — safe to go through Model's normal scoped path. */
    async markDeclined(id: string): Promise<void> {
        const invite = await TeamInvite.find(id);
        if (!invite) return;
        invite.status = "declined";
        await invite.save();
    }

    /** Every pending invite for the CURRENT tenant (TenantContext-scoped). */
    async findPendingForCurrentTenant(): Promise<TeamInvite[]> {
        return TeamInvite.query().where("status", "pending").get();
    }
}
