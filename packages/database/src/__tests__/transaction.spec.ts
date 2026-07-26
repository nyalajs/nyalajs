import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { TransactionContext } from "../transaction-context";
import { Model } from "../model";
import { Table, Primary, StringColumn } from "../schema/decorators";

// NOTE: this exercises the same `db.transaction(tx => TransactionContext.run(tx, fn))`
// pattern DatabaseService.transaction() uses (database.service.ts) without importing
// that module directly — it pulls in drizzle-orm/node-postgres, which requires the
// optional peer dep `pg` to be installed just to import, and this dev environment
// doesn't have it installed. The pattern itself is what's under test here.
async function runInTransaction<T>(txDb: any, fn: () => Promise<T>): Promise<T> {
    return TransactionContext.run(txDb, fn);
}

@Table("widgets")
class Widget extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @StringColumn()
    name!: string;
}

function fakeGlobalDb(label: string) {
    const rows = [{ id: "1", name: label }];
    const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(rows),
        then: (resolve: any) => resolve(rows),
    };
    return { select: () => chain };
}

describe("transaction wiring (DatabaseService.transaction + Model)", () => {
    it("threads the transaction handle through TransactionContext, preferring it over the global connection", async () => {
        const globalDb = fakeGlobalDb("global");
        const txDb = fakeGlobalDb("tx");
        (Widget as any).db = globalDb;

        const seenInsideTx = await runInTransaction(txDb, async () => {
            expect(TransactionContext.get()).toBe(txDb);
            const rows = await Widget.all();
            return rows[0].name;
        });

        expect(seenInsideTx).toBe("tx");
        expect(TransactionContext.get()).toBeUndefined(); // scope doesn't leak after the callback
    });

    it("falls back to the global connection for Model calls made outside any transaction", async () => {
        const globalDb = fakeGlobalDb("global");
        (Widget as any).db = globalDb;

        expect(TransactionContext.get()).toBeUndefined();
        const rows = await Widget.all();
        expect(rows[0].name).toBe("global");
    });

    it("propagates errors thrown inside the transaction (so the caller sees the rollback)", async () => {
        await expect(
            runInTransaction({}, async () => {
                throw new Error("boom");
            })
        ).rejects.toThrow("boom");
    });
});
