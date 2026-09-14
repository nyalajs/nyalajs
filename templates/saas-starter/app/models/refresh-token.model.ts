import { Model, Table, Primary, StringColumn, BooleanColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Refresh tokens — NOT tenant-scoped (no tenantId property at all, matching
 * RefreshTokenRepository's existing `isTenantAware=false`): a refresh token
 * exchange happens before TenantContext is ever set (see AuthService.
 * refreshToken()'s doc comment), so this table can't require one. One row
 * per issued refresh token; `revoked` (rather than deleting the row)
 * preserves an audit trail and lets logout() revoke every token for a user
 * at once without losing history.
 */
@Table("refresh_tokens")
export class RefreshToken extends Model {
    @Primary()
    @StringColumn(255)
    id!: string;

    @StringColumn(255, { dbName: "user_id" })
    userId!: string;

    @StringColumn(500)
    token!: string;

    @TimestampColumn({ dbName: "expires_at" })
    expiresAt!: Date;

    @BooleanColumn()
    revoked!: boolean;

    @TimestampColumn({ dbName: "created_at" })
    createdAt!: Date;
}
