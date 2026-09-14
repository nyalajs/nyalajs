import { randomBytes } from "node:crypto";
import { Injectable, Inject } from "@nyalajs/core";
import { BadRequestException, UnauthorizedException } from "@nyalajs/http";
import { ConfigService } from "@nyalajs/config";
import { Logger } from "@nyalajs/observability";
import { ConnectionContext } from "@nyalajs/database";
import { MailService } from "@nyalajs/mail";
import { RequestContext } from "@nyalajs/http";
import { TenantRegistry } from "@nyalajs/tenancy";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository";
import { UserRepository } from "../repositories/user.repository";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository";
import { ResetPasswordMail } from "../mail/reset-password.mail";
import { hashPassword, comparePassword } from "../helpers/password.helper";
import { runForTenant } from "../../database/run-for-tenant";

const RESET_TOKEN_TTL_HOURS = 1;

export interface ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}

@Injectable()
export class PasswordResetService {
    constructor(
        private readonly config: ConfigService,
        private readonly logger: Logger,
        private readonly mailService: MailService,
        private readonly tokenRepository: PasswordResetTokenRepository,
        private readonly userRepository: UserRepository,
        private readonly refreshTokenRepository: RefreshTokenRepository,
        private readonly tenantRegistry: TenantRegistry,
        @Inject("REQUEST_CONTEXT") private readonly requestContext: RequestContext
    ) {}

    /**
     * Starts a password reset — always returns successfully even if the
     * email doesn't exist, so this endpoint can never be used to enumerate
     * which emails have accounts. Looks across ALL tenants: the same email
     * can have multiple accounts (one per tenant it belongs to), and the
     * person requesting a reset doesn't necessarily know or care which
     * tenant they're resetting — every matching account gets its own
     * reset email.
     */
    async requestPasswordReset(email: string): Promise<{ message: string }> {
        // ...AcrossAllDatabases(), not ...AcrossTenants(): a matching
        // account might live on a dedicated tenant's own database by now
        // (see TenantsService.migrateToDedicated()) — this table has no
        // tenantId to route by, so finding every match means searching
        // every database, not just the shared one.
        const users = await this.userRepository.findAllByEmailAcrossAllDatabases(email.toLowerCase());

        for (const user of users) {
            // NOT wrapped in runForTenant(): PasswordResetToken, like
            // RefreshToken and EmailVerificationToken, always lives on the
            // SHARED database regardless of which database the user's own
            // row came from (see PasswordResetTokenRepository's own class
            // doc comment) — there's no FK to users(id) requiring them to
            // match (see 0005_drop_shared_token_user_fks.ts for why that
            // constraint was removed), and findValidByToken() already
            // searches every database to find it again later regardless.
            // This was WRONG in an earlier version of this method (wrapped
            // in runForTenant(), routing these writes to the user's own
            // potentially-dedicated database) — reproduced against a real
            // dedicated tenant: invalidateAllForUser() failed outright
            // because password_reset_tokens doesn't exist there at all
            // (it's deliberately not one of the tables TenantMigrationService
            // copies — see TenantsService's TENANT_SCOPED_MODELS).
            await this.tokenRepository.invalidateAllForUser(user.id);

            const token = randomBytes(32).toString("hex");
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_TTL_HOURS);

            await this.tokenRepository.create({ userId: user.id, token, expiresAt } as any);

            const resetUrl = `${this.config.get("app.url")}/auth/reset-password?token=${token}`;
            // Not awaited — same reasoning as AuthService.register()'s
            // verification email and TeamService.inviteMember()'s invite
            // email: a real network call to an external SMTP server
            // shouldn't block requestPasswordReset()'s HTTP response, and
            // this endpoint in particular must respond promptly regardless
            // of mail latency (it always returns success immediately, by
            // design, to avoid leaking whether an email exists).
            void this.mailService.send(new ResetPasswordMail(user.email, resetUrl)).catch((err) => {
                this.logger.error("Failed to send password reset email", err instanceof Error ? err : new Error(String(err)), { userId: user.id });
            });
        }

        return { message: "If an account with that email exists, a password reset link has been sent." };
    }

    async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
        // findValidByToken() already searches every database (see its own
        // doc comment) — but once found, we still need the user's real
        // tenantId to route the actual writes (password update, marking
        // the token used, revoking refresh tokens) to the right place.
        const record = await this.tokenRepository.findValidByToken(token);
        if (!record) {
            throw new BadRequestException("This password reset link is invalid or has expired.");
        }

        const user = await this.userRepository.findByIdAcrossAllDatabases(record.userId);
        if (!user) {
            throw new BadRequestException("This password reset link is invalid or has expired.");
        }

        // Only the USER write needs runForTenant()'s routing — the token
        // itself (markUsed(), below) always lives on the shared database,
        // same reasoning as requestPasswordReset()'s own fix above (an
        // earlier version of this method wrapped BOTH in the same
        // runForTenant() block, which routed markUsed() to the wrong
        // database for a dedicated tenant's user).
        await runForTenant(this.tenantRegistry, user.tenantId, async () => {
            const passwordHash = await hashPassword(newPassword);
            await this.userRepository.rawUpdateAcrossTenants(record.userId, { password: passwordHash } as any);
        });
        await this.tokenRepository.markUsed(record.id);

        // Deliberately OUTSIDE runForTenant(): RefreshToken always lives
        // on the shared database (see AuthService.login()'s own comment
        // on issueTokens() for the same reasoning) — a password reset
        // invalidates every existing session, and those session tokens
        // were always written there regardless of which database the
        // user's own row lives on.
        await this.refreshTokenRepository.revokeAllForUser(record.userId);

        return { message: "Password has been reset. Please sign in with your new password." };
    }

    /** For an already-authenticated user changing their own password (requires the current password, unlike the token-based reset flow above). */
    async changePassword(dto: ChangePasswordDto): Promise<{ message: string }> {
        const userId = this.requestContext.userId;
        if (!userId) {
            throw new UnauthorizedException("Not authenticated");
        }

        const user = await this.userRepository.findById(userId);
        if (!user || !(await comparePassword(dto.currentPassword, user.password))) {
            throw new UnauthorizedException("Current password is incorrect");
        }

        const passwordHash = await hashPassword(dto.newPassword);
        await this.userRepository.update(userId, { password: passwordHash } as any);

        // Same reasoning as resetPassword() — a password change should
        // invalidate every OTHER session; the current one keeps working
        // since its access token isn't a refresh token and isn't touched.
        // ConnectionContext.run(undefined, ...): this is an AUTHENTICATED
        // request, so TenantMiddleware may already have ConnectionContext
        // pointed at a dedicated tenant's connection — but RefreshToken
        // always lives on the shared database (see AuthService.logout()'s
        // identical fix for the full reasoning).
        await ConnectionContext.run(undefined as any, () => this.refreshTokenRepository.revokeAllForUser(userId));

        return { message: "Password changed successfully." };
    }
}
