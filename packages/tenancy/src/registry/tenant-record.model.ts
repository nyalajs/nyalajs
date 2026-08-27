import { Model, Table, Primary, StringColumn, TimestampColumn } from "@nyalajs/database";

/** How a tenant's data is isolated. */
export type TenantIsolationMode = "shared" | "dedicated";

/**
 * Which step of a shared<->dedicated migration a tenant is currently in.
 * "none" is the steady state — either fully "shared" or fully "dedicated",
 * not mid-migration. See TenantMigrationService for what drives each
 * transition.
 */
export type TenantMigrationStatus =
    | "none"
    | "provisioning_target"
    | "copying_data"
    | "verifying"
    | "cutover_pending"
    | "failed";

/**
 * The tenant registry — lives in the SHARED/SYSTEM database, never in a
 * dedicated tenant database, and is deliberately NOT itself tenant-scoped
 * (no `tenant_id` column): this table is what tenant scoping is computed
 * FROM, so it can't be routed by the same mechanism it drives without a
 * chicken-and-egg problem.
 *
 * `connectionString` is only meaningful when `isolationMode` is
 * "dedicated" — null/unset for "shared" tenants (they use the app's normal
 * default connection, exactly like every non-multi-tenant app). Store it
 * encrypted at rest in real deployments (e.g. via your secrets manager or a
 * column-level encryption extension) — this package treats the string
 * opaquely and never logs it.
 *
 * @example
 * // Look a tenant up, decide isolation mode, then act on it — this is
 * // exactly what TenantMiddleware does on every request.
 * const record = await TenantRecord.find(tenantId);
 * if (record?.isolationMode === "dedicated") {
 *   const db = await connectionManager.getConnection(record);
 *   // ... run the rest of the request against `db`
 * }
 */
@Table("nyala_tenants")
export class TenantRecord extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @StringColumn()
    name!: string;

    @StringColumn(20)
    isolationMode!: TenantIsolationMode;

    /** Only set when isolationMode is "dedicated". Treat as a secret. */
    @StringColumn(2048)
    connectionString?: string | null;

    /** Which driver `connectionString` should be opened with. Defaults to the app's main driver when unset. */
    @StringColumn(20)
    driver?: string | null;

    @StringColumn(30)
    migrationStatus!: TenantMigrationStatus;

    @TimestampColumn()
    createdAt!: Date;

    @TimestampColumn()
    updatedAt!: Date;
}
