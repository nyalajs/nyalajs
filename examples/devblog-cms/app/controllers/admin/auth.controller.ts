import { Controller, Get, Post, Body, Req, Res } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { view } from "@nyalajs/react";
import { AuthService } from "../../services/auth.service";
import { LoginValidator, LoginDto } from "../../validators/auth.validator";
import { LoginPage } from "../../views/admin/login-page";

@Controller("/admin")
export class AdminAuthController {
    constructor(private readonly authService: AuthService) {}

    @Get("/login")
    loginPage() {
        return view(LoginPage, {});
    }

    @Post("/login")
    @ValidateBody(LoginValidator)
    async login(@Body() dto: LoginDto, @Req() req: any, @Res() res: any) {
        const user = await this.authService.verify(dto.email, dto.password);

        if (!user) {
            return view(LoginPage, { error: "Invalid email or password" });
        }

        req.session.set("userId", user.id);
        req.session.set("role", user.role);
        req.session.set("name", user.name);
        return res.redirect(302, "/admin");
    }

    @Post("/logout")
    async logout(@Req() req: any, @Res() res: any) {
        req.session.delete();
        return res.redirect(302, "/admin/login");
    }
}
