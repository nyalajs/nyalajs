import { Controller, Post, Body, Get, UseGuards } from "@nyala/core";
import { AuthService } from "../services/auth.service";
import { AuthGuard } from "@nyala/security";

interface LoginDto {
    email: string;
    password: string;
}

interface RegisterDto {
    email: string;
    password: string;
    name: string;
}

@Controller("/auth")
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post("/register")
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post("/login")
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
}
