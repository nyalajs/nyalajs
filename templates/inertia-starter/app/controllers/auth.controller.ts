import { Controller, Get, Post, Body, Req, Res } from "@nyalajs/core";
import { inertia, flashValidationErrors, zodErrorsToInertia } from "@nyalajs/inertia";
import { AuthService } from "../services/auth.service";
import { RegisterValidator, LoginValidator } from "../validators/auth.validator";

/**
 * Handles registration/login/logout via session auth (see
 * app/guards/session-auth.guard.ts and docs/inertia-starter-spec.md §3).
 *
 * Validation deliberately runs by hand (schema.safeParse()) instead of the
 * @ValidateBody decorator — see app/validators/auth.validator.ts's doc
 * comment for why: a failed @ValidateBody throws straight to a JSON 422,
 * which isn't the real Inertia round trip. The real pattern is
 * Post/Redirect/Get: on failure, flash the errors into the session and
 * redirect (303) back to the form page; InertiaResponse picks the flashed
 * errors up automatically on the next render (see
 * packages/inertia/src/inertia-response.ts's resolveErrors()).
 */
@Controller("/")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    /** Root redirects to the one real resource in this starter — Posts. */
    @Get("/")
    root(@Res() res: any) {
        return res.redirect(303, "/posts");
    }

    @Get("health")
    health() {
        return { status: "ok", timestamp: new Date().toISOString() };
    }

    @Get("register")
    registerPage(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Auth/Register");
    }

    @Post("register")
    async register(@Body() dto: { name: string; email: string; password: string }, @Req() req: any, @Res() res: any) {
        const parsed = RegisterValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/register");
        }

        try {
            const user = await this.authService.register(parsed.data);
            req.session.set("userId", user.id);
            req.session.set("name", user.name);
            req.session.set("email", user.email);
            return res.redirect(303, "/posts");
        } catch (error: any) {
            flashValidationErrors(req, { email: error.message ?? "Registration failed" });
            return res.redirect(303, "/register");
        }
    }

    @Get("login")
    loginPage(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Auth/Login");
    }

    @Post("login")
    async login(@Body() dto: { email: string; password: string }, @Req() req: any, @Res() res: any) {
        const parsed = LoginValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/login");
        }

        const user = await this.authService.verify(parsed.data.email, parsed.data.password);
        if (!user) {
            flashValidationErrors(req, { email: "Invalid email or password" });
            return res.redirect(303, "/login");
        }

        req.session.set("userId", user.id);
        req.session.set("name", user.name);
        req.session.set("email", user.email);
        return res.redirect(303, "/posts");
    }

    @Post("logout")
    async logout(@Req() req: any, @Res() res: any) {
        req.session.delete();
        return res.redirect(303, "/login");
    }
}
