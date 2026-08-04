import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { SchemaRegistry } from "../schema/registry";
import { Table, Primary, StringColumn, IntColumn, BooleanColumn, TimestampColumn, Column } from "../schema/decorators";

@Table("widgets")
class Widget {
    @Primary()
    @StringColumn()
    id!: string;

    @StringColumn(64)
    name!: string;

    @IntColumn()
    quantity!: number;

    @BooleanColumn()
    active!: boolean;

    @TimestampColumn()
    createdAt!: Date;

    @Column({ type: "json" })
    metadata!: Record<string, unknown>;
}

describe("SchemaRegistry — dialect-aware column building", () => {
    afterEach(() => {
        // Every other test file in this package assumes the default dialect,
        // so restore it (and drop cached tables built under a different one).
        SchemaRegistry.setDialect("postgres");
    });

    it("builds a pgTable with correct Postgres column types", () => {
        SchemaRegistry.setDialect("postgres");
        const table: any = SchemaRegistry.getTable(Widget);

        // @StringColumn() with no explicit length defaults to 255.
        expect(table.id.getSQLType()).toBe("varchar(255)");
        expect(table.name.getSQLType()).toBe("varchar(64)");
        expect(table.quantity.getSQLType()).toBe("integer");
        expect(table.active.getSQLType()).toBe("boolean");
        expect(table.createdAt.getSQLType()).toContain("timestamp");
        expect(table.metadata.getSQLType()).toBe("jsonb");
        expect(SchemaRegistry.getPrimaryKey(Widget)).toBe("id");
    });

    it("builds a mysqlTable with correct MySQL column types", () => {
        SchemaRegistry.setDialect("mysql");
        const table: any = SchemaRegistry.getTable(Widget);

        expect(table.id.getSQLType()).toBe("varchar(255)");
        expect(table.name.getSQLType()).toBe("varchar(64)");
        expect(table.quantity.getSQLType()).toBe("int");
        expect(table.active.getSQLType()).toBe("boolean");
        expect(table.createdAt.getSQLType()).toContain("timestamp");
        expect(table.metadata.getSQLType()).toBe("json");
    });

    it("builds a sqliteTable with correct SQLite column types and modes", () => {
        SchemaRegistry.setDialect("sqlite");
        const table: any = SchemaRegistry.getTable(Widget);

        // SQLite has no VARCHAR/BOOLEAN/TIMESTAMP/JSON — everything is TEXT or INTEGER.
        expect(table.id.getSQLType()).toBe("text");
        expect(table.name.getSQLType()).toBe("text");
        expect(table.quantity.getSQLType()).toBe("integer");
        expect(table.active.getSQLType()).toBe("integer");
        expect(table.active.mode).toBe("boolean");
        expect(table.createdAt.getSQLType()).toBe("integer");
        expect(table.createdAt.mode).toBe("timestamp");

        // SQLite JSON mode has no `.mode` flag — it's a distinct column class
        // (SQLiteTextJson) that (de)serializes through the JS value automatically.
        expect(table.metadata.getSQLType()).toBe("text");
        expect(table.metadata.mapToDriverValue({ a: 1 })).toBe('{"a":1}');
        expect(table.metadata.mapFromDriverValue('{"a":1}')).toEqual({ a: 1 });
    });

    it("clears cached tables when the dialect changes", () => {
        SchemaRegistry.setDialect("postgres");
        const pgTable: any = SchemaRegistry.getTable(Widget);
        expect(pgTable.name.getSQLType()).toBe("varchar(64)");

        SchemaRegistry.setDialect("sqlite");
        const sqliteTable: any = SchemaRegistry.getTable(Widget);
        expect(sqliteTable.name.getSQLType()).toBe("text");
    });
});
