import "reflect-metadata";

export const TABLE_METADATA = "nyala:database:table";
export const COLUMN_METADATA = "nyala:database:columns";

export interface ColumnDefinition {
    name: string;
    type: "string" | "number" | "boolean" | "timestamp" | "json";
    isPrimary?: boolean;
    isNullable?: boolean;
    default?: any;
    length?: number;
}

/** Extra per-column overrides every convenience decorator (StringColumn, TimestampColumn, ...) accepts, on top of its type-specific first argument. */
export interface ColumnOverrides {
    /**
     * The DB column name, when it differs from the JS property name (e.g.
     * `{ dbName: "is_active" }` for an `isActive` property, matching an
     * existing snake_case migration) — without it, the column name defaults
     * to the property name verbatim, which silently produces the WRONG SQL
     * (e.g. an `isActive` column) against any real database whose migration
     * used `is_active`. Confirmed via a real Postgres insert: omitting this
     * against a snake_case table throws `column "isActive" of relation
     * "..." does not exist`.
     */
    dbName?: string;
    /**
     * Whether this column allows NULL. Defaults to false (NOT NULL) — every
     * convenience decorator produces a required column unless you opt out
     * explicitly. This matters for more than just reads: TenantMigrationService's
     * ensureSchema() (the shared<->dedicated migration's auto-provisioning
     * step) builds real `CREATE TABLE` DDL directly from this flag, so a
     * property that's genuinely optional (e.g. `emailVerifiedAt?: Date |
     * null`) but left at the false default produces a NOT NULL target
     * column — the migration's row copy then fails outright the first time
     * it hits a row with that field actually null. Confirmed against a real
     * Postgres migration target.
     */
    nullable?: boolean;
}

function toDefinition(base: Partial<ColumnDefinition>, overrides?: ColumnOverrides): Partial<ColumnDefinition> {
    return {
        ...base,
        ...(overrides?.dbName ? { name: overrides.dbName } : {}),
        ...(overrides?.nullable !== undefined ? { isNullable: overrides.nullable } : {}),
    };
}

/**
 * Decorate a class to map it to a database table.
 */
export function Table(tableName: string): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(TABLE_METADATA, tableName, target);
    };
}

function addColumnMetadata(target: any, propertyKey: string, definition: Partial<ColumnDefinition>) {
    const columns: Map<string, ColumnDefinition> = Reflect.getMetadata(COLUMN_METADATA, target.constructor) || new Map();
    const existing = columns.get(propertyKey) || { name: propertyKey, type: "string" };
    columns.set(propertyKey, { ...existing, ...definition });
    Reflect.defineMetadata(COLUMN_METADATA, columns, target.constructor);
}

/**
 * Define a column.
 */
export function Column(options?: Partial<ColumnDefinition>): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), options || {});
    };
}

/**
 * Define the primary key.
 */
export function Primary(): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), { isPrimary: true });
    };
}

/** String column. See ColumnOverrides for `dbName`/`nullable`. */
export function StringColumn(length: number = 255, overrides?: ColumnOverrides): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), toDefinition({ type: "string", length }, overrides));
    };
}

/** Integer column. See ColumnOverrides for `dbName`/`nullable`. */
export function IntColumn(overrides?: ColumnOverrides): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), toDefinition({ type: "number" }, overrides));
    };
}

/** Timestamp column. See ColumnOverrides for `dbName`/`nullable`. */
export function TimestampColumn(overrides?: ColumnOverrides): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), toDefinition({ type: "timestamp" }, overrides));
    };
}

/** Boolean column. See ColumnOverrides for `dbName`/`nullable`. */
export function BooleanColumn(overrides?: ColumnOverrides): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), toDefinition({ type: "boolean" }, overrides));
    };
}

/**
 * JSON/JSONB column (Postgres jsonb, MySQL json, SQLite TEXT with a `json`
 * Drizzle mode). See ColumnOverrides for `dbName`/`nullable`.
 */
export function JsonColumn(overrides?: ColumnOverrides): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), toDefinition({ type: "json" }, overrides));
    };
}
