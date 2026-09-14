import { Model, DatabaseDriver, ConnectionContext, OpenedConnection, openConnection, SchemaRegistry } from "@nyalajs/database";
import { Injectable, TenantContext } from "@nyalajs/core";
import { TenantRegistry } from "../registry/tenant-registry.service";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";

export interface MigrateToDedicatedOptions {
    tenantId: string;
    /** The target dedicated database's connection string. Must already exist and be reachable. */
    connectionString: string;
    /** Driver for the target database. Defaults to "pg". Must be the SAME dialect as the source (mixed-dialect tenancy isn't supported — SchemaRegistry builds tables for one process-wide dialect). */
    driver?: DatabaseDriver;
    /**
     * Every tenant-scoped Model class to copy. There is no global model
     * registry in this framework (each app defines its own Model classes),
     * so this MUST be supplied explicitly — the migration only touches
     * tables you actually list here.
     */
    models: (typeof Model)[];
    /** Rows copied per batch, per table. Default: 500. */
    batchSize?: number;
    /**
     * If true (default), the target database's tables are created
     * automatically from each Model's own schema definition (same
     * column-building logic SchemaRegistry already uses for the main app)
     * before copying rows — for the common case where the target is a
     * fresh, empty database. The table shape is IDENTICAL to the source,
     * `tenant_id` column included — a dedicated tenant's database still
     * uses the exact same Model class and its exact same schema, it just
     * happens to only ever contain rows for one tenant id. This keeps
     * Model itself completely unaware of isolation mode; nothing about a
     * Model's shape changes based on how a given tenant is isolated.
     * Set to false if you've already applied real migrations to the
     * target yourself (e.g. via `nyala db:migrate` against it) and only
     * want row-copy + cutover.
     */
    autoCreateSchema?: boolean;
    /** Called with (tableName, rowsCopiedSoFar) after each batch, so a caller can report progress on a long-running migration. */
    onProgress?: (tableName: string, rowsCopiedSoFar: number) => void;
}

export interface MigrateToSharedOptions {
    tenantId: string;
    models: (typeof Model)[];
    batchSize?: number;
    onProgress?: (tableName: string, rowsCopiedSoFar: number) => void;
    /** After a successful cutover, close the now-unused dedicated connection via the connection manager (if one was supplied to the service). Default: true. */
    closeSourceConnection?: boolean;
}

export interface MigrationResult {
    tenantId: string;
    tablesCopied: string[];
    rowsCopied: number;
}

/**
 * Moves ONE tenant's data between shared-DB (row-level `tenant_id`
 * isolation) and dedicated-DB (its own physical database) storage, live,
 * without downtime for other tenants and without a redeploy — the
 * "developers can simply migrate a tenant" ask this package exists to
 * satisfy.
 *
 * A dedicated tenant's database uses the EXACT SAME Model classes/schema as
 * the shared database, `tenant_id` column included — it just only ever
 * holds rows for that one tenant id. This is a deliberate simplicity
 * choice: Model stays completely unaware of isolation mode (no
 * dedicated-only vs shared-only schema variant to keep in sync), and
 * `TenantContext`'s existing mandatory-scoping behavior (`Model` throws if
 * a tenant-scoped table is queried with no active tenant) works unchanged
 * on a dedicated connection too — it just always resolves to the same id.
 *
 * Both directions follow the same shape:
 *   1. Verify (and optionally auto-provision) the target has the right
 *      table schema.
 *   2. Copy every listed table's rows across in batches, tenant-scoped
 *      reads from the source, tenant-scoped writes to the target — the
 *      normal Model/TenantContext machinery does the actual filtering and
 *      stamping, this service just points it at the right connections in
 *      the right order via ConnectionContext.
 *   3. Verify row counts match, then atomically flip the tenant's registry
 *      entry (isolationMode + connectionString) via TenantRegistry — this
 *      is the actual cutover; everything before it is preparation that can
 *      safely be retried or abandoned without affecting live traffic,
 *      since no request routes to the target until this flips.
 *
 * The SOURCE data is deliberately left intact after a successful migration
 * — this service never deletes anything. Clean it up yourself once you've
 * verified the target.
 *
 * Every step here runs against REAL connections (opened via the same
 * `openConnection()` @nyalajs/database's own DatabaseService uses) — there
 * is no dry-run/simulation mode. Test against a real (e.g. disposable
 * Postgres/SQLite) target before running this against production data.
 */
@Injectable()
export class TenantMigrationService {
    constructor(
        private readonly registry: TenantRegistry,
        private readonly connections?: TenantConnectionManager
    ) {}

    async migrateToDedicated(options: MigrateToDedicatedOptions): Promise<MigrationResult> {
        const { tenantId, models, batchSize = 500, autoCreateSchema = true, onProgress } = options;

        const record = await this.registry.findOrThrow(tenantId);
        if (record.isolationMode === "dedicated") {
            throw new Error(`[nyala/tenancy] Tenant "${tenantId}" is already dedicated. Nothing to migrate.`);
        }

        await this.registry.setMigrationStatus(tenantId, "provisioning_target");

        const target = await openConnection({
            driver: options.driver ?? "pg",
            connectionString: options.connectionString,
        });

        try {
            if (autoCreateSchema) {
                await this.ensureSchema(target, models);
            }

            await this.registry.setMigrationStatus(tenantId, "copying_data");
            // Source = whatever's already active for this tenant right now
            // (the shared connection — no ConnectionContext override
            // needed to read it). Target = the freshly-opened dedicated DB.
            const { tablesCopied, rowsCopied } = await this.copyTenantRows({
                tenantId,
                models,
                batchSize,
                readConnection: undefined,
                writeConnection: target.db,
                onProgress,
            });

            await this.registry.setMigrationStatus(tenantId, "verifying");
            await this.verifyRowCounts(tenantId, models, undefined, target.db);

            await this.registry.setMigrationStatus(tenantId, "cutover_pending");
            await this.registry.setIsolation(tenantId, {
                isolationMode: "dedicated",
                connectionString: options.connectionString,
                driver: options.driver ?? "pg",
            });
            await this.registry.setMigrationStatus(tenantId, "none");

            return { tenantId, tablesCopied, rowsCopied };
        } catch (err) {
            await this.registry.setMigrationStatus(tenantId, "failed");
            throw err;
        } finally {
            // This ad-hoc handle (opened here purely for provisioning/
            // copying) is separate from whatever TenantConnectionManager
            // later opens for live request traffic post-cutover — must be
            // closed here regardless of outcome, or it leaks.
            await target.close();
        }
    }

    async migrateToShared(options: MigrateToSharedOptions): Promise<MigrationResult> {
        const { tenantId, models, batchSize = 500, onProgress, closeSourceConnection = true } = options;

        const record = await this.registry.findOrThrow(tenantId);
        if (record.isolationMode !== "dedicated") {
            throw new Error(`[nyala/tenancy] Tenant "${tenantId}" is not dedicated. Nothing to migrate.`);
        }
        if (!record.connectionString) {
            throw new Error(`[nyala/tenancy] Tenant "${tenantId}" is marked dedicated but has no connectionString.`);
        }

        await this.registry.setMigrationStatus(tenantId, "copying_data");

        const source = await openConnection({
            driver: (record.driver as DatabaseDriver | undefined) ?? "pg",
            connectionString: record.connectionString,
        });

        try {
            // Source = the dedicated DB just opened above. Target =
            // whatever's already active for this tenant right now (the
            // shared connection — no ConnectionContext override needed).
            const { tablesCopied, rowsCopied } = await this.copyTenantRows({
                tenantId,
                models,
                batchSize,
                readConnection: source.db,
                writeConnection: undefined,
                onProgress,
            });

            await this.registry.setMigrationStatus(tenantId, "verifying");
            await this.verifyRowCounts(tenantId, models, source.db, undefined);

            await this.registry.setMigrationStatus(tenantId, "cutover_pending");
            await this.registry.setIsolation(tenantId, { isolationMode: "shared", connectionString: null, driver: null });
            await this.registry.setMigrationStatus(tenantId, "none");

            if (closeSourceConnection && this.connections) {
                await this.connections.evict(tenantId);
            }

            return { tenantId, tablesCopied, rowsCopied };
        } catch (err) {
            await this.registry.setMigrationStatus(tenantId, "failed");
            throw err;
        } finally {
            await source.close();
        }
    }

    /**
     * Creates each Model's table on `target` if it doesn't already exist,
     * using the exact same column-building logic SchemaRegistry uses for
     * the main app (so the target's shape is guaranteed consistent with
     * what the app's own Model classes expect) — a real `CREATE TABLE IF
     * NOT EXISTS`, not a simulated/logged one.
     */
    private async ensureSchema(target: OpenedConnection, models: (typeof Model)[]): Promise<void> {
        for (const modelClass of models) {
            const ddl = this.buildCreateTableSql(modelClass, target.dialect);
            await this.execDdl(target, ddl);
        }
    }

    private buildCreateTableSql(modelClass: typeof Model, dialect: "postgres" | "mysql" | "sqlite"): string {
        const table = SchemaRegistry.getTable(modelClass);
        const tableName = table[Symbol.for("drizzle:Name")] as string;
        const columns: any[] = Object.values(table[Symbol.for("drizzle:Columns")] ?? {});

        const columnSql = columns.map((col) => this.buildColumnSql(col, dialect)).join(", ");
        const quote = dialect === "mysql" ? "`" : `"`;
        return `CREATE TABLE IF NOT EXISTS ${quote}${tableName}${quote} (${columnSql})`;
    }

    private buildColumnSql(col: any, dialect: "postgres" | "mysql" | "sqlite"): string {
        const quote = dialect === "mysql" ? "`" : `"`;
        const name = `${quote}${col.name}${quote}`;
        const sqlType = this.sqlTypeFor(col, dialect);
        const notNull = col.notNull ? " NOT NULL" : "";
        const primary = col.primary ? " PRIMARY KEY" : "";
        const defaultClause = this.defaultClauseFor(col, dialect);
        return `${name} ${sqlType}${primary}${notNull}${defaultClause}`;
    }

    /**
     * A PRIMARY KEY string column with no application-supplied default gets
     * `DEFAULT gen_random_uuid()` on Postgres — Model never generates ids
     * client-side (confirmed by Model.insertAndReturn()'s own MySQL-specific
     * fallback, which exists precisely because MySQL has no such default to
     * lean on), so every real migration this framework's own starter
     * templates ship gives their UUID primary key a DB-level
     * `DEFAULT gen_random_uuid()`. Without matching that here, `INSERT ...
     * VALUES (DEFAULT, ...)` — what Model.create() emits whenever the
     * caller didn't supply an id — fails outright against an
     * auto-provisioned target with a `NOT NULL PRIMARY KEY` column but no
     * default to satisfy it. Confirmed against a real migration: an
     * auto-provisioned target table without this let every table with an
     * empty source (so ensureSchema() had to create it fresh, never copied
     * an existing row's real id) reject every subsequent write.
     *
     * MySQL and SQLite are left alone — MySQL's own Model.insertAndReturn()
     * path already has a documented $returningId()-based strategy for ids
     * it doesn't generate itself, and SQLite's UUID generation isn't a
     * built-in SQL function the way Postgres's gen_random_uuid() is, so
     * there's no single-clause equivalent to add here safely.
     */
    private defaultClauseFor(col: any, dialect: "postgres" | "mysql" | "sqlite"): string {
        if (dialect !== "postgres") return "";

        const isUuidLikeString = ["PgVarchar", "PgText"].includes(col.columnType ?? "");
        if (col.primary && isUuidLikeString) {
            return " DEFAULT gen_random_uuid()";
        }

        // Same reasoning as the primary-key UUID default above, for
        // timestamp columns: this framework's own convention (every
        // migration its starter templates ship) is `created_at TIMESTAMP
        // NOT NULL DEFAULT NOW()` — and just like ids, Model never sets a
        // createdAt/updatedAt value client-side unless the app explicitly
        // does, so Model.create() emits `DEFAULT` for that column whenever
        // the caller didn't supply one. Confirmed against a real
        // migration: a table auto-provisioned without this rejected every
        // write with "null value in column ... violates not-null
        // constraint" the instant a caller (correctly, by this
        // framework's own convention) relied on the DB to stamp the
        // timestamp. Column-NAME based, not a real "is this a
        // created/updated timestamp" signal from SchemaRegistry (which
        // doesn't track that) — matches createdAt/updatedAt specifically
        // rather than every NOT NULL timestamp, since a timestamp that's
        // actually meant to be caller-supplied (e.g. expiresAt) must NOT
        // silently get a NOW() default.
        const isTimestamp = col.columnType === "PgTimestamp";
        const isCreatedOrUpdatedColumn = /^(created_at|updated_at)$/i.test(col.name ?? "");
        if (isTimestamp && isCreatedOrUpdatedColumn) {
            return " DEFAULT NOW()";
        }

        return "";
    }

    /**
     * Maps a Drizzle column to a raw SQL type string, driven by its exact
     * `columnType` value (verified directly against real pgTable/
     * mysqlTable/sqliteTable output for every type this package's own
     * SchemaRegistry.buildColumn() can produce — string/number/boolean/
     * timestamp/json — rather than fragile substring matching: e.g.
     * `"MySqlVarChar".includes("Varchar")` is FALSE, capital C, which would
     * silently mis-type every MySQL string column as TEXT and break a
     * primary-key column outright, since MySQL requires an explicit length
     * on any TEXT column used as a PRIMARY KEY).
     */
    private sqlTypeFor(col: any, dialect: "postgres" | "mysql" | "sqlite"): string {
        const columnType: string = col.columnType ?? "";

        if (dialect === "sqlite") {
            // better-sqlite3 has exactly two storage classes Drizzle maps
            // onto here: INTEGER (SQLiteInteger, and the boolean/timestamp
            // modes built on top of it) and TEXT (SQLiteText, and its json
            // mode variant SQLiteTextJson).
            const integerTypes = new Set(["SQLiteInteger", "SQLiteBoolean", "SQLiteTimestamp"]);
            return integerTypes.has(columnType) ? "INTEGER" : "TEXT";
        }

        const varcharTypes = new Set(["PgVarchar", "MySqlVarChar"]);
        if (varcharTypes.has(columnType)) {
            return col.length ? `VARCHAR(${col.length})` : "TEXT";
        }

        const textTypes = new Set(["PgText", "MySqlText"]);
        if (textTypes.has(columnType)) return "TEXT";

        const intTypes = new Set(["PgInteger", "MySqlInt"]);
        if (intTypes.has(columnType)) return dialect === "postgres" ? "INTEGER" : "INT";

        const booleanTypes = new Set(["PgBoolean", "MySqlBoolean"]);
        if (booleanTypes.has(columnType)) return "BOOLEAN";

        const timestampTypes = new Set(["PgTimestamp", "MySqlTimestamp"]);
        if (timestampTypes.has(columnType)) return dialect === "postgres" ? "TIMESTAMP" : "DATETIME";

        const jsonTypes = new Set(["PgJsonb", "MySqlJson"]);
        if (jsonTypes.has(columnType)) return dialect === "postgres" ? "JSONB" : "JSON";

        throw new Error(
            `[nyala/tenancy] Don't know how to create a ${dialect} column for Drizzle columnType "${columnType}" ` +
            `(column "${col.name}"). This means SchemaRegistry started producing a column type ` +
            "TenantMigrationService's schema-provisioning doesn't recognize yet — file an issue rather than guessing."
        );
    }

    private async execDdl(target: OpenedConnection, ddl: string): Promise<void> {
        const db: any = target.db;
        if (target.dialect === "sqlite") {
            db.run(ddl);
        } else {
            await db.execute(ddl as any);
        }
    }

    /**
     * Pages through every listed model's rows for `tenantId`, batch by
     * batch, reading from `readConnection` (or the currently-active
     * connection, when undefined — i.e. "the shared pool, nothing special
     * to do") and writing each batch to `writeConnection` (same rule).
     * Every read/write happens inside `TenantContext.run()` with `tenantId`
     * set, so Model's own existing mandatory tenant-scoping (the WHERE
     * filter on read, the tenant_id stamp on insert) does the real
     * filtering/stamping — this method never hand-builds a WHERE clause or
     * touches tenant_id itself.
     */
    private async copyTenantRows(args: {
        tenantId: string;
        models: (typeof Model)[];
        batchSize: number;
        readConnection: any | undefined;
        writeConnection: any | undefined;
        onProgress?: (tableName: string, rowsCopiedSoFar: number) => void;
    }): Promise<{ tablesCopied: string[]; rowsCopied: number }> {
        const { tenantId, models, batchSize, readConnection, writeConnection, onProgress } = args;
        const tablesCopied: string[] = [];
        let totalRows = 0;

        for (const modelClass of models) {
            const tableName = (SchemaRegistry.getTable(modelClass) as any)[Symbol.for("drizzle:Name")] as string;
            let copiedForTable = 0;
            let offset = 0;

            for (;;) {
                const batch = await this.withConnectionAndTenant<any[]>(readConnection, tenantId, () =>
                    (modelClass as any).query().orderBy("id", "asc").limit(batchSize).offset(offset).get()
                );
                if (batch.length === 0) break;

                await this.withConnectionAndTenant(writeConnection, tenantId, async () => {
                    for (const row of batch) {
                        const { id, ...rest } = row as any;
                        // Upsert, not a blind create(): the SOURCE side is
                        // deliberately never deleted after a migration (see
                        // class doc comment), so a tenant that was
                        // previously migrated dedicated->shared->dedicated
                        // (or is being migrated back a second time) can
                        // have stale rows with these SAME ids still sitting
                        // on the target. The target's current dedicated
                        // data is authoritative — that's where every write
                        // has landed since the last cutover — so an
                        // existing row is overwritten with the source's
                        // current values, never left stale or duplicated.
                        const existing = await (modelClass as any).find(id);
                        if (existing) {
                            Object.assign(existing, rest);
                            await existing.save();
                        } else {
                            await (modelClass as any).create({ id, ...rest });
                        }
                    }
                });

                copiedForTable += batch.length;
                totalRows += batch.length;
                offset += batchSize;
                onProgress?.(tableName, copiedForTable);

                if (batch.length < batchSize) break;
            }

            if (copiedForTable > 0) tablesCopied.push(tableName);
        }

        return { tablesCopied, rowsCopied: totalRows };
    }

    /** Runs `fn` with TenantContext set to `tenantId`, and — only when `connection` is a real handle — inside ConnectionContext.run() pointed at it. Undefined `connection` means "whatever's already active", i.e. the normal shared-pool path. */
    private async withConnectionAndTenant<T>(connection: any | undefined, tenantId: string, fn: () => Promise<T>): Promise<T> {
        const withTenant = () =>
            TenantContext.run(async () => {
                TenantContext.set(tenantId);
                return fn();
            });
        return connection !== undefined ? ConnectionContext.run(connection, withTenant) : withTenant();
    }

    /**
     * Confirms the copy actually landed the right number of rows per table
     * before cutover — catches a silently-truncated copy (e.g. a write that
     * failed halfway and was swallowed) rather than flipping traffic to an
     * incomplete dataset. Counts on both sides go through the same
     * tenant-scoped Model path as the copy itself, so a mismatch here means
     * a real data discrepancy, not a counting-method inconsistency.
     */
    private async verifyRowCounts(
        tenantId: string,
        models: (typeof Model)[],
        readConnection: any | undefined,
        writeConnection: any | undefined
    ): Promise<void> {
        for (const modelClass of models) {
            const sourceCount = await this.withConnectionAndTenant(readConnection, tenantId, async () => {
                const rows = await (modelClass as any).query().get();
                return rows.length;
            });
            const targetCount = await this.withConnectionAndTenant(writeConnection, tenantId, async () => {
                const rows = await (modelClass as any).query().get();
                return rows.length;
            });

            if (sourceCount !== targetCount) {
                throw new Error(
                    `[nyala/tenancy] Migration verification failed for tenant "${tenantId}", table ` +
                    `"${modelClass.name}": source has ${sourceCount} rows, target has ${targetCount}.`
                );
            }
        }
    }
}
