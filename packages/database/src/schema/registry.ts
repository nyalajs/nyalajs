import { pgTable, varchar, integer, boolean, timestamp, text, PgColumnBuilder } from "drizzle-orm/pg-core";
import { COLUMN_METADATA, TABLE_METADATA, ColumnDefinition } from "./decorators";

export class SchemaRegistry {
    private static tables = new Map<any, ReturnType<typeof pgTable>>();

    /**
     * Builds and returns a Drizzle pgTable for a given Model class.
     */
    static getTable(modelClass: any): any {
        if (this.tables.has(modelClass)) {
            return this.tables.get(modelClass);
        }

        const tableName = Reflect.getMetadata(TABLE_METADATA, modelClass);
        if (!tableName) {
            throw new Error(`Model ${modelClass.name} is not decorated with @Table`);
        }

        const columns: Map<string, ColumnDefinition> = Reflect.getMetadata(COLUMN_METADATA, modelClass);
        if (!columns || columns.size === 0) {
            throw new Error(`Model ${modelClass.name} has no columns defined.`);
        }

        const drizzleColumns: Record<string, any> = {};

        for (const [propertyKey, def] of columns.entries()) {
            let colBuilder: any;

            switch (def.type) {
                case "string":
                    colBuilder = def.length ? varchar(def.name, { length: def.length }) : text(def.name);
                    break;
                case "number":
                    colBuilder = integer(def.name);
                    break;
                case "boolean":
                    colBuilder = boolean(def.name);
                    break;
                case "timestamp":
                    colBuilder = timestamp(def.name, { mode: "date" });
                    break;
                default:
                    colBuilder = text(def.name);
            }

            if (def.isPrimary) colBuilder = colBuilder.primaryKey();
            if (!def.isNullable && !def.isPrimary) colBuilder = colBuilder.notNull();
            if (def.default !== undefined) colBuilder = colBuilder.default(def.default);

            drizzleColumns[propertyKey] = colBuilder;
        }

        const table = pgTable(tableName, drizzleColumns);
        this.tables.set(modelClass, table);
        return table;
    }
}
