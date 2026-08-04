import {
    pgTable,
    varchar as pgVarchar,
    integer as pgInteger,
    boolean as pgBoolean,
    timestamp as pgTimestamp,
    text as pgText,
    jsonb as pgJsonb,
} from "drizzle-orm/pg-core";
import {
    mysqlTable,
    varchar as mysqlVarchar,
    int as mysqlInt,
    boolean as mysqlBoolean,
    timestamp as mysqlTimestamp,
    text as mysqlText,
    json as mysqlJson,
} from "drizzle-orm/mysql-core";
import {
    sqliteTable,
    integer as sqliteInteger,
    text as sqliteText,
} from "drizzle-orm/sqlite-core";
import { COLUMN_METADATA, TABLE_METADATA, ColumnDefinition } from "./decorators";
import { DatabaseDialect } from "../dialect";

interface BuiltTable {
    table: any;
    /** The model property key holding the primary key (not the DB column name). */
    primaryKey: string | undefined;
}

/**
 * Builds one column for the given dialect from a dialect-agnostic
 * ColumnDefinition. Every dialect's builder chain (.primaryKey()/.notNull()/
 * .default()) is applied uniformly by the caller since that part of the
 * Drizzle column-builder API is consistent across pg-core/mysql-core/sqlite-core.
 */
function buildColumn(dialect: DatabaseDialect, def: ColumnDefinition): any {
    switch (dialect) {
        case "postgres":
            switch (def.type) {
                case "string":
                    return def.length ? pgVarchar(def.name, { length: def.length }) : pgText(def.name);
                case "number":
                    return pgInteger(def.name);
                case "boolean":
                    return pgBoolean(def.name);
                case "timestamp":
                    return pgTimestamp(def.name, { mode: "date" });
                case "json":
                    return pgJsonb(def.name);
                default:
                    return pgText(def.name);
            }
        case "mysql":
            // MySQL's VARCHAR requires an explicit length; fall back to TEXT when none was given.
            switch (def.type) {
                case "string":
                    return def.length ? mysqlVarchar(def.name, { length: def.length }) : mysqlText(def.name);
                case "number":
                    return mysqlInt(def.name);
                case "boolean":
                    return mysqlBoolean(def.name);
                case "timestamp":
                    return mysqlTimestamp(def.name, { mode: "date" });
                case "json":
                    return mysqlJson(def.name);
                default:
                    return mysqlText(def.name);
            }
        case "sqlite":
            // SQLite has no native VARCHAR/BOOLEAN/TIMESTAMP/JSON types — everything
            // is stored as TEXT or INTEGER, with Drizzle's `mode` doing the mapping.
            switch (def.type) {
                case "string":
                    return sqliteText(def.name);
                case "number":
                    return sqliteInteger(def.name);
                case "boolean":
                    return sqliteInteger(def.name, { mode: "boolean" });
                case "timestamp":
                    return sqliteInteger(def.name, { mode: "timestamp" });
                case "json":
                    return sqliteText(def.name, { mode: "json" });
                default:
                    return sqliteText(def.name);
            }
    }
}

export class SchemaRegistry {
    /**
     * Which dialect to build tables for. Defaults to "postgres" so existing
     * pg-only callers (and tests that never call setDialect) keep working
     * exactly as before. DatabaseService.connect() sets this for real.
     */
    private static dialect: DatabaseDialect = "postgres";
    private static tables = new Map<any, BuiltTable>();

    /** Set by DatabaseService.connect() once the active driver is known. */
    static setDialect(dialect: DatabaseDialect): void {
        if (this.dialect !== dialect) {
            this.dialect = dialect;
            // Tables already built for the previous dialect are invalid under the new one.
            this.tables.clear();
        }
    }

    static getDialect(): DatabaseDialect {
        return this.dialect;
    }

    /**
     * Builds and returns the Drizzle table (pgTable/mysqlTable/sqliteTable,
     * depending on the active dialect) for a given Model class.
     */
    static getTable(modelClass: any): any {
        return this.build(modelClass).table;
    }

    /** The model property key (not DB column name) marked with @Primary(). */
    static getPrimaryKey(modelClass: any): string | undefined {
        return this.build(modelClass).primaryKey;
    }

    private static build(modelClass: any): BuiltTable {
        const cached = this.tables.get(modelClass);
        if (cached) return cached;

        const tableName = Reflect.getMetadata(TABLE_METADATA, modelClass);
        if (!tableName) {
            throw new Error(`Model ${modelClass.name} is not decorated with @Table`);
        }

        const columns: Map<string, ColumnDefinition> = Reflect.getMetadata(COLUMN_METADATA, modelClass);
        if (!columns || columns.size === 0) {
            throw new Error(`Model ${modelClass.name} has no columns defined.`);
        }

        const drizzleColumns: Record<string, any> = {};
        let primaryKey: string | undefined;

        for (const [propertyKey, def] of columns.entries()) {
            let colBuilder = buildColumn(this.dialect, def);

            if (def.isPrimary) {
                colBuilder = colBuilder.primaryKey();
                primaryKey = propertyKey;
            }
            if (!def.isNullable && !def.isPrimary) colBuilder = colBuilder.notNull();
            if (def.default !== undefined) colBuilder = colBuilder.default(def.default);

            drizzleColumns[propertyKey] = colBuilder;
        }

        const table =
            this.dialect === "postgres"
                ? pgTable(tableName, drizzleColumns)
                : this.dialect === "mysql"
                  ? mysqlTable(tableName, drizzleColumns)
                  : sqliteTable(tableName, drizzleColumns);

        const built: BuiltTable = { table, primaryKey };
        this.tables.set(modelClass, built);
        return built;
    }
}
