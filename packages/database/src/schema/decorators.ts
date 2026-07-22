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

/**
 * String column.
 */
export function StringColumn(length: number = 255): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), { type: "string", length });
    };
}

/**
 * Integer column.
 */
export function IntColumn(): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), { type: "number" });
    };
}

/**
 * Timestamp column.
 */
export function TimestampColumn(): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), { type: "timestamp" });
    };
}

/**
 * Boolean column.
 */
export function BooleanColumn(): PropertyDecorator {
    return (target: any, propertyKey: string | symbol) => {
        addColumnMetadata(target, propertyKey.toString(), { type: "boolean" });
    };
}
