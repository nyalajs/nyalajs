import { Injectable } from "@nyalajs/core";
import { ConnectionContext } from "@nyalajs/database";
import { BaseRepository } from "./base.repository";
import { EmailVerificationToken } from "../models/email-verification-token.model";
import { findAcrossAllDatabases } from "../../database/cross-tenant-token-lookup";

/**
 * NOT tenant-aware — created on the shared database always (see
 * sendVerificationEmail()'s only real call site, AuthService.register(),
 * which runs for a brand-new tenant that can't possibly be dedicated yet).
 *
 * findValidByToken() still has to check every OTHER database too, though:
 * by the time someone actually clicks the verification link, their tenant
 * might have since been migrated to dedicated (see TenantsService.
 * migrateToDedicated()) — and this table has no tenantId at all to route
 * by directly, so there's no way to know which database to check without
 * searching. Same reasoning/pattern as TeamInviteRepository.
 * findValidByToken() — see findAcrossAllDatabases()'s own doc comment.
 */
@Injectable()
export class EmailVerificationTokenRepository extends BaseRepository<EmailVerificationToken> {
    constructor() {
        super(EmailVerificationToken);
    }

    /** An unused, unexpired token — the only state that should ever verify an email. */
    async findValidByToken(token: string): Promise<EmailVerificationToken | null> {
        const checkOne = (): Promise<EmailVerificationToken | null> =>
            EmailVerificationToken.query().where("token", token).whereNull("usedAt").where("expiresAt", ">", new Date()).first();

        return findAcrossAllDatabases(checkOne, (dedicatedDb) =>
            ConnectionContext.run(dedicatedDb, checkOne)
        );
    }

    /** Marks used against WHATEVER connection is active when called — see EmailVerificationService.verifyEmail(), which wraps this in runForTenant() once it knows the token's real tenant. */
    async markUsed(id: string): Promise<void> {
        const token = await EmailVerificationToken.find(id);
        if (!token) return;
        token.usedAt = new Date();
        await token.save();
    }
}
