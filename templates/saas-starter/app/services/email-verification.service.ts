import { randomBytes } from "node:crypto";
import { Injectable } from "@nyalajs/core";
import { BadRequestException, NotFoundException } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { MailService } from "@nyalajs/mail";
import { TenantRegistry } from "@nyalajs/tenancy";
import { EmailVerificationTokenRepository } from "../repositories/email-verification-token.repository";
import { UserRepository } from "../repositories/user.repository";
import { VerifyEmailMail } from "../mail/verify-email.mail";
import { runForTenant } from "../../database/run-for-tenant";
import type { User } from "../models/user.model";

const TOKEN_TTL_HOURS = 24;

@Injectable()
export class EmailVerificationService {
    constructor(
        private readonly config: ConfigService,
        private readonly logger: Logger,
        private readonly mailService: MailService,
        private readonly tokenRepository: EmailVerificationTokenRepository,
        private readonly userRepository: UserRepository,
        private readonly tenantRegistry: TenantRegistry
    ) {}

    /** Called right after a new user is created (registration, or an accepted team invite). */
    async sendVerificationEmail(user: Pick<User, "id" | "email" | "name">): Promise<void> {
        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + TOKEN_TTL_HOURS);

        await this.tokenRepository.create({
            userId: user.id,
            token,
            expiresAt,
        } as any);

        const verificationUrl = `${this.config.get("app.url")}/auth/verify-email?token=${token}`;

        try {
            await this.mailService.send(new VerifyEmailMail(user, verificationUrl));
        } catch (err) {
            // A failed send should never fail the signup/invite-acceptance
            // it's part of — the account is still created and usable
            // (just unverified); resend-verification exists precisely so a
            // transient mail-provider outage isn't a dead end.
            this.logger.error("Failed to send verification email", err instanceof Error ? err : new Error(String(err)), { userId: user.id });
        }
    }

    /**
     * Marks the user's email verified and consumes the token. Throws on an
     * invalid/expired/already-used token — callers surface that as a real
     * error, not a silent no-op.
     *
     * findValidByToken() already searched every database for the token
     * itself (see its own doc comment); once found, the USER write
     * (stamping emailVerifiedAt) needs to happen against that SAME
     * tenant's real database — found via findByIdAcrossAllDatabases() (one
     * more full search, since the token record alone doesn't say which
     * database it came from either), then runForTenant() once the user's
     * real tenantId is known. markUsed() is deliberately OUTSIDE that
     * routing: EmailVerificationToken, like RefreshToken/
     * PasswordResetToken, always lives on the shared database regardless
     * of which database the user's own row came from (see
     * EmailVerificationTokenRepository's own class doc comment) — an
     * earlier version of this method wrapped both in the same
     * runForTenant() block, which routed markUsed() to the wrong database
     * for a dedicated tenant's user (confirmed against a real one: the
     * same "table doesn't exist there" failure requestPasswordReset() had
     * before its own identical fix).
     */
    async verifyEmail(token: string): Promise<void> {
        const record = await this.tokenRepository.findValidByToken(token);
        if (!record) {
            throw new BadRequestException("This verification link is invalid or has expired.");
        }

        const user = await this.userRepository.findByIdAcrossAllDatabases(record.userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }

        if (!user.emailVerifiedAt) {
            await runForTenant(this.tenantRegistry, user.tenantId, () =>
                this.userRepository.rawUpdateAcrossTenants(user.id, { emailVerifiedAt: new Date() } as Partial<User>)
            );
        }
        await this.tokenRepository.markUsed(record.id);
    }

    /** Re-sends a verification email for an already-registered, not-yet-verified account. */
    async resendVerification(userId: string): Promise<void> {
        const user = await this.userRepository.findByIdAcrossAllDatabases(userId);
        if (!user) {
            throw new NotFoundException("User not found");
        }
        if (user.emailVerifiedAt) {
            throw new BadRequestException("This email is already verified.");
        }
        // Deliberately outside runForTenant(): sendVerificationEmail()'s
        // own token write is meant for the shared database always (see
        // its doc comment / EmailVerificationTokenRepository's own class
        // doc comment) — the SAME reasoning as issueTokens() in
        // AuthService.login(), for the same non-tenant-scoped-table reason.
        await this.sendVerificationEmail(user);
    }
}
