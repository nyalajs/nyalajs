import { Controller, Get, Post, Body, Req, Res } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";
import { inertia, flashValidationErrors, zodErrorsToInertia } from "@nyalajs/inertia";
import { AdminLoginValidator } from "../validators/auth.validator";
import { comparePassword } from "../helpers/password.helper";

/**
 * The single admin login/logout gate for this docs demo — not a real
 * multi-user account system (see app/guards/admin.guard.ts's doc comment
 * for why one password is enough here). Same hand-run .safeParse() +
 * flash + 303-redirect pattern as DocsController and
 * templates/inertia-starter's own AuthController.
 */
@Controller("/admin")
export class AuthController {
    constructor(private readonly config: ConfigService) {}

    @Get("login")
    loginPage(@Req() req: any, @Res() res: any) {
        return inertia(req, res, "Auth/Login");
    }

    @Post("login")
    async login(@Body() dto: { password: string }, @Req() req: any, @Res() res: any) {
        const parsed = AdminLoginValidator.safeParse(dto);
        if (!parsed.success) {
            flashValidationErrors(req, zodErrorsToInertia(parsed.error));
            return res.redirect(303, "/admin/login");
        }

        const hash = this.config.get<string>("app.adminPasswordHash", "");
        // Fails closed: an unset ADMIN_PASSWORD_HASH means every login
        // attempt is rejected, not "any password works" — comparePassword
        // against an empty hash would throw (bcrypt requires a real hash
        // string), so this is checked explicitly rather than left to
        // that error to surface as a 500.
        const valid = hash.length > 0 && (await comparePassword(parsed.data.password, hash));
        if (!valid) {
            flashValidationErrors(req, { password: "Incorrect password" });
            return res.redirect(303, "/admin/login");
        }

        req.session.set("isAdmin", true);
        return res.redirect(303, "/");
    }

    @Post("logout")
    async logout(@Req() req: any, @Res() res: any) {
        req.session.delete();
        return res.redirect(303, "/");
    }
}
