import { Injectable } from "@nyalajs/core";
import { Model, ConnectionContext, SchemaRegistry } from "@nyalajs/database";
import { eq, and, isNull } from "drizzle-orm";
import { BaseRepository } from "./base.repository";
import { PasswordResetToken } from "../models/password-reset-token.model";
import { findAcrossAllDatabases } from "../../database/cross-tenant-token-lookup";

/**
 * NOT tenant-aware — same reasoning as EmailVerificationTokenRepository:
 * looked up by token value, independent of tenant context (a "forgot
 * password" request has no session at all).
 *
 * findValidByToken() checks every database, not just the shared one — see
 * EmailVerificationTokenRepository.findValidByToken()'s doc comment for
 * why (this table has no tenantId to route by directly either).
 */
@Injectable()
export class PasswordResetTokenRepository extends BaseRepository<PasswordResetToken> {
    constructor() {
        super(PasswordResetToken);
    }

    async findValidByToken(token: string): Promise<PasswordResetToken | null> {
        const checkOne = (): Promise<PasswordResetToken | null> =>
            PasswordResetToken.query().where("token", token).whereNull("usedAt").where("expiresAt", ">", new Date()).first();

        return findAcrossAllDatabases(checkOne, (dedicatedDb) => ConnectionContext.run(dedicatedDb, checkOne));
    }

    async markUsed(id: string): Promise<void> {
        const token = await PasswordResetToken.find(id);
        if (!token) return;
        token.usedAt = new Date();
        await token.save();
    }

    /**
     * Invalidates every OUTSTANDING reset token for a user in ONE
     * statement — called whenever a new one is issued, so only the latest
     * "forgot password" email is ever valid. A real bulk UPDATE, not a
     * fetch-then-save loop — same reasoning as
     * RefreshTokenRepository.revokeAllForUser().
     */
    async invalidateAllForUser(userId: string): Promise<void> {
        const table = SchemaRegistry.getTable(PasswordResetToken);
        const conn = ConnectionContext.get() ?? (Model as any).db;
        await conn.update(table).set({ usedAt: new Date() }).where(and(eq(table.userId, userId), isNull(table.usedAt)));
    }
}
