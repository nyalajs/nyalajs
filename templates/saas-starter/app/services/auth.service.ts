import { Injectable } from "@nyala/core";
import { UnauthorizedException, ConflictException } from "@nyala/http";
import { ConfigService } from "@nyala/config";
import { Logger } from "@nyala/observability";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";

interface RegisterDto {
    email: string;
    password: string;
    name: string;
}

interface LoginDto {
    email: string;
    password: string;
}

@Injectable()
export class AuthService {
    constructor(
        private config: ConfigService,
        private logger: Logger,
    ) { }

    async register(dto: RegisterDto) {
        this.logger.info("Registering new user", { email: dto.email });

        // TODO: Check if user exists and create in database
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        const user = {
            id: "user-123",
            email: dto.email,
            name: dto.name,
        };

        const tokens = this.generateTokens(user);

        return {
            user: this.sanitizeUser(user),
            ...tokens,
        };
    }

    async login(dto: LoginDto) {
        this.logger.info("User login attempt", { email: dto.email });

        // TODO: Find user in database
        const user = {
            id: "user-123",
            email: dto.email,
            name: "Test User",
            password: await bcrypt.hash(dto.password, 10),
        };

        const isValid = await bcrypt.compare(dto.password, user.password);
        if (!isValid) {
            throw new UnauthorizedException("Invalid credentials");
        }

        const tokens = this.generateTokens(user);

        return {
            user: this.sanitizeUser(user),
            ...tokens,
        };
    }

    async refreshToken(refreshToken: string) {
        try {
            const secret = this.config.get("JWT_REFRESH_SECRET", "refresh-secret");
            const payload = jwt.verify(refreshToken, secret) as any;

            const user = {
                id: payload.sub,
                email: payload.email,
                name: "Test User",
            };

            return this.generateTokens(user);
        } catch (error) {
            throw new UnauthorizedException("Invalid refresh token");
        }
    }

    async getCurrentUser() {
        // TODO: Get from context and lookup in database
        return {
            id: "user-123",
            email: "user@example.com",
            name: "Test User",
        };
    }

    async logout() {
        return { message: "Logged out successfully" };
    }

    private generateTokens(user: any) {
        const secret = this.config.get("JWT_SECRET", "change-me-in-production");
        const refreshSecret = this.config.get("JWT_REFRESH_SECRET", "refresh-secret");

        const accessToken = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                type: "access",
            },
            secret,
            { expiresIn: "15m" },
        );

        const refreshToken = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                type: "refresh",
            },
            refreshSecret,
            { expiresIn: "7d" },
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: 900,
        };
    }

    private sanitizeUser(user: any) {
        const { password, ...sanitized } = user;
        return sanitized;
    }
}
