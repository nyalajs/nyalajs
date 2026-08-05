import * as bcrypt from "bcrypt";

/**
 * Password Helper
 *
 * Utility functions for password hashing and verification. Same as
 * templates/basic-starter's — bcrypt, not a JWT/session-specific concern.
 */

const SALT_ROUNDS = 10;

/** Hash a password */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compare a plaintext password against a bcrypt hash */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}
