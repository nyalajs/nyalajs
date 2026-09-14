import { Injectable } from "@nyalajs/core";
import { Model, ConnectionContext, SchemaRegistry } from "@nyalajs/database";
import { eq } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { RefreshToken } from "../models/refresh-token.model";

/**
 * Refresh Token Repository (NOT tenant-aware)
 *
 * RefreshToken's Model has no `tenantId` column at all, so every query here
 * naturally runs unscoped — a token is looked up by its own value (globally
 * unique) or by user id, at moments (login, token exchange) that
 * specifically happen BEFORE any tenant context exists for the request. See
 * UserRepository's findByEmailInTenant()/findByIdAcrossTenants() doc
 * comments for the same reasoning applied to users during that same
 * pre-tenant-context window.
 */
@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshToken> {
    constructor() {
        super(RefreshToken);
    }

    /** A refresh token that exists, hasn't been revoked, and hasn't expired — the only state AuthService.refreshToken() should ever accept. */
    async findValidByToken(token: string): Promise<RefreshToken | null> {
        return RefreshToken.query()
            .where("token", token)
            .where("revoked", false)
            .where("expiresAt", ">", new Date())
            .first();
    }

    async revoke(id: string): Promise<void> {
        const token = await RefreshToken.find(id);
        if (!token) return;
        token.revoked = true;
        await token.save();
    }

    /**
     * Revokes every refresh token for a user in ONE statement — used by
     * logout() so a logged-out session can't be resurrected via an old
     * refresh token. A real bulk UPDATE, not a fetch-all-then-save loop:
     * Model has no bulk-update API (only per-instance .save()), and a user
     * can accumulate many refresh token rows over time, so looping would be
     * both slower and non-atomic (a crash mid-loop leaves some tokens
     * revoked and others not) compared to a single UPDATE ... WHERE.
     */
    async revokeAllForUser(userId: string): Promise<void> {
        const table = SchemaRegistry.getTable(RefreshToken);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        await conn.update(table).set({ revoked: true }).where(eq(table.userId, userId));
    }
}
