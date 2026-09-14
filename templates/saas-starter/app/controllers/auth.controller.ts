import { Controller, Post, Get, Body, Query, UseGuards } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { AuthGuard } from "@nyalajs/security";
import { AuthService, RegisterDto, LoginDto } from "../services/auth.service";
import { EmailVerificationService } from "../services/email-verification.service";
import { PasswordResetService, ChangePasswordDto } from "../services/password-reset.service";
import {
    RegisterValidator,
    LoginValidator,
    ForgotPasswordValidator,
    ResetPasswordValidator,
    ChangePasswordValidator,
} from "../validators/auth.validator";

interface ForgotPasswordDto {
    email: string;
}

interface ResetPasswordDto {
    token: string;
    newPassword: string;
}

@Controller("/auth")
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly emailVerificationService: EmailVerificationService,
        private readonly passwordResetService: PasswordResetService
    ) {}

    /** Creates a brand-new tenant (workspace) and its owner account in one call — see AuthService.register()'s doc comment. */
    @Post("/register")
    @ValidateBody(RegisterValidator)
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    /**
     * `tenantSlug` is required whenever the request doesn't already carry
     * which workspace to sign in to some other way (e.g. arriving via that
     * workspace's own subdomain, `acme.yourapp.com`) — the same email can
     * exist in more than one tenant, so login has to know which one first.
     */
    @Post("/login")
    @ValidateBody(LoginValidator)
    async login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Post("/refresh")
    async refresh(@Body("refreshToken") refreshToken: string) {
        return this.authService.refreshToken(refreshToken);
    }

    @Get("/me")
    @UseGuards(AuthGuard)
    async me() {
        return this.authService.getCurrentUser();
    }

    @Post("/logout")
    @UseGuards(AuthGuard)
    async logout() {
        return this.authService.logout();
    }

    @Get("/verify-email")
    async verifyEmail(@Query("token") token: string) {
        await this.emailVerificationService.verifyEmail(token);
        return { message: "Email verified successfully." };
    }

    @Post("/resend-verification")
    @UseGuards(AuthGuard)
    async resendVerification() {
        // AuthGuard has already authenticated the caller — getCurrentUser()
        // reads REQUEST_CONTEXT.userId the same way, so this reuses it
        // rather than re-deriving the id here.
        const user = await this.authService.getCurrentUser();
        await this.emailVerificationService.resendVerification(user.id);
        return { message: "Verification email sent." };
    }

    @Post("/forgot-password")
    @ValidateBody(ForgotPasswordValidator)
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.passwordResetService.requestPasswordReset(dto.email);
    }

    @Post("/reset-password")
    @ValidateBody(ResetPasswordValidator)
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    }

    @Post("/change-password")
    @UseGuards(AuthGuard)
    @ValidateBody(ChangePasswordValidator)
    async changePassword(@Body() dto: ChangePasswordDto) {
        return this.passwordResetService.changePassword(dto);
    }
}
