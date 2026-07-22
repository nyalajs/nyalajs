import { Injectable } from "@nyalajs/core";
import { Logger } from "@nyalajs/observability";
import { ConfigService } from "@nyalajs/config";
import * as jwt from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository";
import { LoginDto } from "../dto/login.dto";
import { CreateUserDto } from "../dto/create-user.dto";
import { User } from "../models/user.model";
import { comparePassword, hashPassword } from "../helpers/password.helper";

/**
 * Authentication Service
 *
 * Handles user authentication, registration, and token management.
 */
@Injectable()
export class AuthService {
    private jwtSecret: string;
    private jwtExpiresIn: string;
    private jwtRefreshExpiresIn: string;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly configService: ConfigService,
        private readonly logger: Logger
    ) {
        this.jwtSecret = this.configService.get<string>("JWT_SECRET") || "your-secret-key";
        this.jwtExpiresIn = this.configService.get<string>("JWT_EXPIRES_IN") || "15m";
        this.jwtRefreshExpiresIn = this.configService.get<string>("JWT_REFRESH_EXPIRES_IN") || "7d";
    }

    /**
     * Register a new user
     */
    async register(dto: CreateUserDto): Promise<{
        user: Omit<User, "password">;
        accessToken: string;
        refreshToken: string;
    }> {
        // Check if user exists
        const exists = await this.userRepository.emailExists(dto.email);
        if (exists) {
            this.logger.warn("Registration failed: Email already exists", { email: dto.email });
            throw new Error("Email already exists");
        }

        // Hash password
        const hashedPassword = await hashPassword(dto.password);

        // Create user
        const user = await this.userRepository.create({
            ...dto,
            password: hashedPassword,
        });

        this.logger.info("User registered", { userId: user.id, email: user.email });

        // Generate tokens
        const accessToken = this.generateAccessToken(user);
        const refreshToken = this.generateRefreshToken(user);

        // Remove password from response
        const { password, ...userWithoutPassword } = user;

        return {
            user: userWithoutPassword,
            accessToken,
            refreshToken,
        };
    }

    /**
     * Login user
     */
    async login(dto: LoginDto): Promise<{
        user: Omit<User, "password">;
        accessToken: string;
        refreshToken: string;
    }> {
        // Find user
        const user = await this.userRepository.findByEmail(dto.email);
        if (!user) {
            this.logger.warn("Login failed: User not found", { email: dto.email });
            throw new Error("Invalid credentials");
        }

        // Check if user is active
        if (!user.isActive) {
            this.logger.warn("Login failed: User is inactive", { userId: user.id });
            throw new Error("Account is inactive");
        }

        // Verify password
        const isValidPassword = await comparePassword(dto.password, user.password);
        if (!isValidPassword) {
            this.logger.warn("Login failed: Invalid password", { email: dto.email });
            throw new Error("Invalid credentials");
        }

        this.logger.info("User logged in", { userId: user.id, email: user.email });

        // Update last login
        await this.userRepository.updateLastLogin(user.id);

        // Generate tokens
        const accessToken = this.generateAccessToken(user);
        const refreshToken = this.generateRefreshToken(user);

        // Remove password from response
        const { password, ...userWithoutPassword } = user;

        return {
            user: userWithoutPassword,
            accessToken,
            refreshToken,
        };
    }

    /**
     * Refresh access token
     */
    async refreshToken(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }> {
        try {
            // Verify refresh token
            const payload = jwt.verify(refreshToken, this.jwtSecret) as any;

            // Find user
            const user = await this.userRepository.findById(payload.sub);
            if (!user || !user.isActive) {
                throw new Error("Invalid token");
            }

            // Generate new tokens
            const newAccessToken = this.generateAccessToken(user);
            const newRefreshToken = this.generateRefreshToken(user);

            this.logger.info("Token refreshed", { userId: user.id });

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            };
        } catch (error) {
            this.logger.error("Token refresh failed", error as Error);
            throw new Error("Invalid refresh token");
        }
    }

    /**
     * Get current user from token
     */
    async me(userId: string): Promise<Omit<User, "password"> | null> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            return null;
        }

        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Verify JWT token
     */
    verifyToken(token: string): any {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            this.logger.error("Token verification failed", error as Error);
            throw new Error("Invalid token");
        }
    }

    /**
     * Generate access token
     */
    private generateAccessToken(user: User): string {
        return jwt.sign(
            {
                sub: user.id,
                email: user.email,
                type: "access",
            },
            this.jwtSecret,
            { expiresIn: this.jwtExpiresIn } as jwt.SignOptions
        );
    }

    /**
     * Generate refresh token
     */
    private generateRefreshToken(user: User): string {
        return jwt.sign(
            {
                sub: user.id,
                type: "refresh",
            },
            this.jwtSecret,
            { expiresIn: this.jwtRefreshExpiresIn } as jwt.SignOptions
        );
    }
}
