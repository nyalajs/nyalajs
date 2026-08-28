import { sql } from "drizzle-orm";

/**
 * Drops the FOREIGN KEY from refresh_tokens/email_verification_tokens/
 * password_reset_tokens' `user_id` column to `users(id)` — these three
 * tables always live on the SHARED database (see each repository's own
 * doc comment: none of them are tenant-scoped, and none are migrated when
 * a tenant moves to a dedicated database, see TenantsService.
 * migrateToDedicated()), but once dedicated-per-tenant support is in use
 * (@nyalajs/tenancy — see 0004_tenant_registry.ts), a `users` row can live
 * on a COMPLETELY DIFFERENT physical database than these token tables. A
 * foreign key across two separate database connections isn't just
 * unenforceable, it's a contradiction — Postgres has no way to validate a
 * reference to a row that, from this database's point of view, doesn't
 * exist at all.
 *
 * Reproduced against a real dedicated tenant: logging in as a user whose
 * own `users` row lives on their tenant's dedicated database failed
 * outright issuing a refresh token, because inserting into the SHARED
 * database's `refresh_tokens` violated this exact FK — a user who very
 * much does exist, just not in the table Postgres was checking against.
 *
 * Referential integrity for these tables is enforced at the application
 * level instead (every write goes through UserRepository/
 * RefreshTokenRepository/etc., which always supply a real, already-
 * verified user id) — the same trust boundary this framework already
 * relies on for cross-database consistency generally (see
 * TenantMigrationService's own doc comment: there is no cross-database
 * transaction, migrations verify row counts after the fact instead of
 * relying on a constraint to catch a mismatch as it happens).
 */

export async function up(db: any) {
    await db.execute(sql`ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey`);
    await db.execute(sql`ALTER TABLE email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_tokens_user_id_fkey`);
    await db.execute(sql`ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_fkey`);

    console.log("✔ Migration completed: dropped shared-token-table FKs to users(id) (dedicated-tenant users may not exist in the shared users table)");
}

export async function down(db: any) {
    // Re-adding these assumes every existing row's user_id still resolves
    // in the shared users table — true only if no tenant has been
    // migrated to dedicated since this migration ran. Safe for a fresh
    // rollback in development; a production rollback should confirm that
    // first.
    await db.execute(sql`ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);
    await db.execute(
        sql`ALTER TABLE email_verification_tokens ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
    );
    await db.execute(
        sql`ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
    );

    console.log("✔ Migration rolled back");
}
