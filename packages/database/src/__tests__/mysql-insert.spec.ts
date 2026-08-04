import "reflect-metadata";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Model } from "../model";
import { SchemaRegistry } from "../schema/registry";
import { Table, Primary, StringColumn } from "../schema/decorators";

@Table("orders")
class Order extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @StringColumn()
    item!: string;
}

/** Mimics the shape of a MySQL2 Drizzle db for insert/select chains. */
function fakeMySqlDb(rows: any[] = []) {
    const inserted: any[] = [];
    const selectChain = {
        from: () => selectChain,
        where: () => selectChain,
        limit: () => Promise.resolve(rows),
    };
    return {
        insert: () => ({
            values: (data: any) => {
                inserted.push(data);
                const execPromise: any = Promise.resolve({});
                execPromise.$returningId = () => Promise.resolve([{ id: "generated-id" }]);
                return execPromise;
            },
        }),
        select: () => selectChain,
        getInserted: () => inserted,
    };
}

describe("Model insert on MySQL (no RETURNING support)", () => {
    beforeEach(() => {
        SchemaRegistry.setDialect("mysql");
    });

    afterEach(() => {
        SchemaRegistry.setDialect("postgres");
    });

    it("inserts once and re-selects by the caller-supplied primary key", async () => {
        const rows = [{ id: "order-1", item: "widget" }];
        const db = fakeMySqlDb(rows);
        (Order as any).db = db;

        const order = await Order.create({ id: "order-1", item: "widget" } as any);

        expect(db.getInserted()).toHaveLength(1);
        expect(order.item).toBe("widget");
    });

    it("falls back to $returningId() and re-selects when no id was supplied", async () => {
        const rows = [{ id: "generated-id", item: "gadget" }];
        const db = fakeMySqlDb(rows);
        (Order as any).db = db;

        const order = await Order.create({ item: "gadget" } as any);

        // Exactly one INSERT — $returningId() must reuse the same insert, not issue a second one.
        expect(db.getInserted()).toHaveLength(1);
        expect((order as any).id).toBe("generated-id");
        expect(order.item).toBe("gadget");
    });
});
