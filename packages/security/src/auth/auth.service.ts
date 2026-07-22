import { Injectable } from "@nyalajs/core";
import { JwtStrategy } from "./jwt-strategy";
import { HashingService } from "./hashing.service";

/**
 * Interface that your user models must implement for the AuthService to use them.
 */
export interface Authenticatable {
    id: string | number;
    email: string;
    password?: string;
    roles?: string[];
}

export interface UserProvider {
    /** Fetch a user by their email address */
    findByEmail(email: string): Promise<Authenticatable | null>;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtStrategy: JwtStrategy,
        private readonly hashingService: HashingService
    ) {}

    /**
     * Attempt to authenticate a user using email and password.
     * Throws an Error if authentication fails.
     */
    async attemptLogin(email: string, plainTextPassword: string, userProvider: UserProvider): Promise<any> {
        const user = await userProvider.findByEmail(email);

        if (!user || !user.password) {
            throw new Error("Invalid credentials");
        }

        const isValid = await this.hashingService.compare(plainTextPassword, user.password);

        if (!isValid) {
            throw new Error("Invalid credentials");
        }

        return this.generateTokens(user);
    }

    /**
     * Generate access and refresh tokens for a user.
     */
    generateTokens(user: Authenticatable) {
        // This relies on the JwtStrategy implementation for signing tokens.
        // We assume JwtStrategy has been updated to include a sign() method.
        const payload = { sub: String(user.id), email: user.email, roles: user.roles || [] };
        
        const accessToken = this.jwtStrategy.sign(payload, { expiresIn: '15m' });
        const refreshToken = this.jwtStrategy.sign(payload, { expiresIn: '7d' });

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: "Bearer"
        };
    }
}
