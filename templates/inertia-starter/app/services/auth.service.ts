import { Injectable } from "@nyalajs/core";
import { Logger } from "@nyalajs/observability";
import { UserRepository } from "../repositories/user.repository";
import { User } from "../models/user.model";
import { comparePassword, hashPassword } from "../helpers/password.helper";

/**
 * Authentication Service
 *
 * Session-based (see docs/inertia-starter-spec.md §3) — this service only
 * verifies credentials and creates accounts; AuthController owns writing
 * userId/name/email into the session on success (mirrors
 * templates/cms-starter's AdminAuthController, which sets the session
 * directly in the controller rather than a service method).
 */
@Injectable()
export class AuthService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly logger: Logger
    ) {}

    /** Registers a new user. Throws if the email is already taken. */
    async register(data: { name: string; email: string; password: string }): Promise<User> {
        const exists = await this.userRepository.emailExists(data.email);
        if (exists) {
            throw new Error("Email already in use");
        }

        const hashedPassword = await hashPassword(data.password);
        const user = await this.userRepository.createUser({
            name: data.name,
            email: data.email,
            password: hashedPassword,
            isActive: true,
        });

        this.logger.info("User registered", { userId: user.id, email: user.email });
        return user;
    }

    /** Verifies email/password for the login form. Returns null on any failure. */
    async verify(email: string, password: string): Promise<User | null> {
        const user = await this.userRepository.findByEmail(email);
        if (!user || !user.isActive) return null;

        const valid = await comparePassword(password, user.password);
        return valid ? user : null;
    }

    /** Updates the signed-in user's display name — the one editable field on Settings. */
    async updateProfile(userId: string, data: { name: string }): Promise<User | null> {
        const updated = await this.userRepository.update(userId, data);
        if (updated) {
            this.logger.info("Profile updated", { userId });
        }
        return updated;
    }

    /** Changes the signed-in user's password after verifying the current one. */
    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<"ok" | "invalid-current"> {
        const user = await this.userRepository.findById(userId);
        if (!user) return "invalid-current";

        const valid = await comparePassword(currentPassword, user.password);
        if (!valid) return "invalid-current";

        await this.userRepository.update(userId, { password: await hashPassword(newPassword) });
        this.logger.info("Password changed", { userId });
        return "ok";
    }
}
