import { Model, Table, Primary, StringColumn, BooleanColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Users — tenant-scoped @nyalajs/database Model. The `tenantId` property
 * (exactly that name — Model's tenant-scoping machinery keys off the JS
 * property `tenantId` on the built Drizzle table, see Model.stampTenant()/
 * requireTenantScope()) makes every `User.find()`/`.query()`/`.create()`/
 * `.save()` call automatically scoped to TenantContext.get() — same
 * mandatory, fail-closed policy this app's own BaseRepository already had,
 * now enforced one layer lower, in the framework itself.
 *
 * Column names use `dbName` overrides to match the snake_case columns
 * `database/migrations/0001_initial.ts` creates, and `nullable` overrides
 * to match which columns are genuinely optional there — keep both in sync
 * with that migration if you add a column. See UserRepository for the
 * escape hatches (findByEmailInTenant, findByIdAcrossTenants, etc.) needed
 * for the pre-tenant-context flows (login, refresh, accept-invite) that
 * can't use Model's automatic TenantContext-based scoping.
 */
@Table("users")
export class User extends Model {
    @Primary()
    @StringColumn(255)
    id!: string;

    @StringColumn(255, { dbName: "tenant_id" })
    tenantId!: string;

    @StringColumn(255)
    name!: string;

    @StringColumn(255)
    email!: string;

    @StringColumn(255)
    password!: string;

    @StringColumn(50)
    role!: string;

    @BooleanColumn({ dbName: "is_active" })
    isActive!: boolean;

    @TimestampColumn({ dbName: "email_verified_at", nullable: true })
    emailVerifiedAt?: Date | null;

    @TimestampColumn({ dbName: "last_login_at", nullable: true })
    lastLoginAt?: Date | null;

    @TimestampColumn({ dbName: "created_at" })
    createdAt!: Date;

    @TimestampColumn({ dbName: "updated_at" })
    updatedAt!: Date;
}

/**
 * A plain-data shape for a User with its password stripped, safe to return
 * from an API response. `Omit<User, "password">` doesn't work for this
 * (User is a class — Model instances carry .save()/.delete()/.load()
 * methods, which a plain destructured `{ ...rest }` object doesn't have,
 * failing that Omit's structural type check) — this is the real fix,
 * spelled out as its own data-only interface instead.
 */
export interface PublicUser {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    emailVerifiedAt?: Date | null;
    lastLoginAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
