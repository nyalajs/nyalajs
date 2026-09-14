import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Team invites — tenant-scoped (has `tenantId`). One row per invite sent
 * to join a tenant. `status` moves pending -> accepted | declined | expired.
 * A partial unique index (see
 * database/migrations/0002_tenant_lifecycle_and_rbac.ts — NOT something
 * SchemaRegistry's auto-built table can express, it only builds plain
 * columns; the real constraint lives in the hand-written migration)
 * enforces at most one PENDING invite per (tenant, email) at a time, while
 * still allowing a full history of past invites to the same address.
 *
 * TeamInviteRepository.findValidByToken() bypasses Model's automatic
 * TenantContext-based scoping — accept-invite is deliberately
 * unauthenticated (see TeamService.acceptInvite()'s doc comment), so
 * there's no active tenant to scope by; the token itself is what identifies
 * both the invite AND which tenant it belongs to.
 */
@Table("team_invites")
export class TeamInvite extends Model {
    @Primary()
    @StringColumn(255)
    id!: string;

    @StringColumn(255, { dbName: "tenant_id" })
    tenantId!: string;

    @StringColumn(255, { dbName: "invited_by_user_id" })
    invitedByUserId!: string;

    @StringColumn(255)
    email!: string;

    @StringColumn(50)
    role!: string;

    @StringColumn(255)
    token!: string;

    @StringColumn(20)
    status!: string;

    @TimestampColumn({ dbName: "expires_at" })
    expiresAt!: Date;

    @TimestampColumn({ dbName: "accepted_at", nullable: true })
    acceptedAt?: Date | null;

    @TimestampColumn({ dbName: "created_at" })
    createdAt!: Date;
}
