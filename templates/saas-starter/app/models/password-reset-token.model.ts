import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Password reset tokens — NOT tenant-scoped, same reasoning as
 * RefreshToken/EmailVerificationToken: forgot/reset-password is a pre-auth
 * flow with no TenantContext set. One row per issued reset link; `usedAt`
 * makes a token single-use — once consumed, findValidByToken() no longer
 * returns it even if it hasn't technically expired yet.
 */
@Table("password_reset_tokens")
export class PasswordResetToken extends Model {
    @Primary()
    @StringColumn(255)
    id!: string;

    @StringColumn(255, { dbName: "user_id" })
    userId!: string;

    @StringColumn(255)
    token!: string;

    @TimestampColumn({ dbName: "expires_at" })
    expiresAt!: Date;

    @TimestampColumn({ dbName: "used_at", nullable: true })
    usedAt?: Date | null;

    @TimestampColumn({ dbName: "created_at" })
    createdAt!: Date;
}
