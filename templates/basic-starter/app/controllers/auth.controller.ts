import { Controller, Get, Post, Body, Headers } from "@nyalajs/core";
import { ValidateBody } from "@nyalajs/validation";
import { AuthService } from "../services/auth.service";
import { LoginDto } from "../dto/login.dto";
import { LoginValidator } from "../validators/user.validator";

/**
 * Authentication Controller
 *
 * Handles user authentication endpoints.
 */
@Controller("/auth")
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    /**
     * POST /auth/register
     * Register a new user
  /**
     * POST /auth/login
     * Login user
     */
    @Post("/login")
    @ValidateBody(LoginValidator)
    async login(@Body() dto: LoginDto) {
        try {
            const result = await this.authService.login(dto);

            return {
                statusCode: 200,
                message: "Login successful",
                data: result,
            };
        } catch (error: any) {
            return {
                statusCode: 401,
                message: error.message,
            };
        }
    }

    /**
     * POST /auth/refresh
     * Refresh access token
     */
    @Post("/refresh")
    async refresh(@Body("refreshToken") refreshToken: string) {
        try {
            const result = await this.authService.refreshToken(refreshToken);

            return {
                statusCode: 200,
                message: "Token refreshed successfully",
                data: result,
            };
        } catch (error: any) {
            return {
                statusCode: 401,
                message: error.message,
            };
        }
    }

    /**
     * GET /auth/me
     * Get current user
     */
    @Get("/me")
    async me(@Headers("authorization") authorization: string) {
        try {
            if (!authorization || !authorization.startsWith("Bearer ")) {
                return {
                    statusCode: 401,
                    message: "Unauthorized",
                };
            }

            const token = authorization.substring(7);
            const payload = this.authService.verifyToken(token);
            const user = await this.authService.me(payload.sub);

            if (!user) {
                return {
                    statusCode: 404,
                    message: "User not found",
                };
            }

            return {
                statusCode: 200,
                data: user,
            };
        } catch (error: any) {
            return {
                statusCode: 401,
                message: "Unauthorized",
            };
        }
    }

    /**
     * POST /auth/logout
     * Logout user (client-side token deletion)
     */
    @Post("/logout")
    async logout() {
        return {
            statusCode: 200,
            message: "Logged out successfully",
        };
    }
}
