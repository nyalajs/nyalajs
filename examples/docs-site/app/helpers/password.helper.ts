import * as bcrypt from "bcrypt";

/**
 * Password Helper
 *
 * Same shape as templates/inertia-starter's own password.helper.ts —
 * bcrypt, not a JWT/session-specific concern. Used only by the single
 * admin-password gate (see app/guards/admin.guard.ts), not a full
 * multi-user account system — this app has exactly one password, set via
 * ADMIN_PASSWORD_HASH.
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
