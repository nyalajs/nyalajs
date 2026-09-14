import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Email verification tokens — NOT tenant-scoped, same reasoning as
 * RefreshToken: verify-email is a pre-auth flow with no TenantContext set.
 * One row per issued verification link; `usedAt` (rather than deleting the
 * row on use) keeps a record that verification actually happened and when.
 */
@Table("email_verification_tokens")
export class EmailVerificationToken extends Model {
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
