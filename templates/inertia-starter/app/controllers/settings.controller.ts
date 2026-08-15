import { Controller, Get, Post, Body, Req, Res, UseGuards } from "@nyalajs/core";
import { inertia, flash, flashValidationErrors, zodErrorsToInertia } from "@nyalajs/inertia";
import { SessionAuthGuard } from "../guards/session-auth.guard";
import { AuthService } from "../services/auth.service";
import { ProfileValidator, ChangePasswordValidator } from "../validators/settings.validator";

/**
 * Account settings — update display name, change password. Same
 * validate-by-hand + flash + 303-redirect pattern as AuthController/
 * PostsController (see their doc comments for why @ValidateBody isn't used
 * here).
 */
@Controller("/settings")
@UseGuards(SessionAuthGuard)
export class SettingsController {
    constructor(private readonly authService: AuthService) {}

    @Get("/")
    page(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Settings/Index");
    }

    @Post("/profile")
    async updateProfile(@Body() dto: { name: string }, @Req() req: any, @Res() res: any) {
        const parsed = ProfileValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/settings");
        }

        const userId = req.session.get("userId");
        await this.authService.updateProfile(userId, parsed.data);
        req.session.set("name", parsed.data.name);
        flash(req, "success", "Profile updated.");
        return res.redirect(303, "/settings");
    }

    @Post("/password")
    async changePassword(
        @Body() dto: { currentPassword: string; newPassword: string },
        @Req() req: any,
        @Res() res: any
    ) {
        const parsed = ChangePasswordValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/settings");
        }

        const userId = req.session.get("userId");
        const result = await this.authService.changePassword(
            userId,
            parsed.data.currentPassword,
            parsed.data.newPassword
        );

        if (result === "invalid-current") {
            flashValidationErrors(req, { currentPassword: "Current password is incorrect" });
            return res.redirect(303, "/settings");
        }

        flash(req, "success", "Password changed.");
        return res.redirect(303, "/settings");
    }
}
