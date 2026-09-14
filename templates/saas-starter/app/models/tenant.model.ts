import { Model, Table, Primary, StringColumn, BooleanColumn, TimestampColumn } from "@nyalajs/database";

/**
 * Tenants — a @nyalajs/database Model (not raw Drizzle), so it participates
 * in @nyalajs/tenancy's dedicated-per-tenant-database migration/routing
 * (ConnectionContext/TenantMigrationService both operate on Model classes
 * only — see TenantMigrationService's own doc comment). This table itself
 * has NO tenant_id column (a tenant can't be scoped to itself), matching
 * TenantRepository's existing `isTenantAware=false` behavior.
 *
 * Column names use `dbName` overrides to match the snake_case columns
 * `database/migrations/0001_initial.ts` actually creates, and `nullable`
 * overrides to match which columns are genuinely optional there (defaults
 * to NOT NULL otherwise — see StringColumn's own doc comment on why this
 * matters beyond just reads: TenantMigrationService's schema
 * auto-provisioning builds real DDL from this flag). Keep both in sync
 * with that migration if you add a column.
 */
@Table("tenants")
export class Tenant extends Model {
    @Primary()
    @StringColumn(255)
    id!: string;

    @StringColumn(255)
    name!: string;

    @StringColumn(100)
    slug!: string;

    @StringColumn(255, { nullable: true })
    domain?: string | null;

    @BooleanColumn({ dbName: "is_active" })
    isActive!: boolean;

    @StringColumn(50, { nullable: true })
    plan?: string | null;

    /**
     * JSON string (TEXT column, not jsonb) — matches the migration exactly;
     * parse/stringify at the call site. `length: 0` (not the default 255)
     * is what makes SchemaRegistry.buildColumn() emit TEXT instead of
     * VARCHAR(255) — see its `def.length ? pgVarchar(...) : pgText(...)`.
     */
    @StringColumn(0, { nullable: true })
    settings?: string | null;

    @TimestampColumn({ dbName: "created_at" })
    createdAt!: Date;

    @TimestampColumn({ dbName: "updated_at" })
    updatedAt!: Date;
}
