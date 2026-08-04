import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseService } from "../database.service";
import { Model } from "../model";
import { Table, Primary, StringColumn, IntColumn } from "../schema/decorators";

/**
 * Real, unmocked exercise of the "better-sqlite3" driver end to end —
 * connect(), CRUD through Model, and DatabaseService.transaction()'s
 * hand-rolled BEGIN/COMMIT/ROLLBACK path (better-sqlite3's own
 * db.transaction() wrapper requires a synchronous callback, which is
 * why that path exists at all; this test is what proves it's correct).
 */
@Table("accounts")
class Account extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @StringColumn()
    name!: string;

    @IntColumn()
    balance!: number;
}

describe("DatabaseService — better-sqlite3 driver (live, in-memory)", () => {
    const db = new DatabaseService();

    beforeAll(async () => {
        await db.connect({ driver: "better-sqlite3", connectionString: ":memory:" });
        Model.setDatabase(db.getDb());
        (db.getDb() as any).run(
            "CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance INTEGER NOT NULL)"
        );
    });

    afterAll(async () => {
        await db.disconnect();
    });

    it("reports the sqlite dialect", () => {
        expect(db.getDialect()).toBe("sqlite");
    });

    it("creates and finds a record", async () => {
        await Account.create({ id: "acc-1", name: "Alice", balance: 100 } as any);
        const found = await Account.find("acc-1");
        expect(found?.name).toBe("Alice");
        expect(found?.balance).toBe(100);
    });

    it("lists all records", async () => {
        await Account.create({ id: "acc-2", name: "Bob", balance: 50 } as any);
        const all = await Account.all();
        expect(all.map((a) => a.id).sort()).toEqual(["acc-1", "acc-2"]);
    });

    it("updates a record via save()", async () => {
        const acc = await Account.find("acc-1");
        (acc as any).balance = 200;
        await acc!.save();

        const reloaded = await Account.find("acc-1");
        expect(reloaded?.balance).toBe(200);
    });

    it("deletes a record", async () => {
        await Account.create({ id: "acc-3", name: "Carol", balance: 10 } as any);
        const acc = await Account.find("acc-3");
        await acc!.delete();
        expect(await Account.find("acc-3")).toBeNull();
    });

    it("commits a successful transaction", async () => {
        await db.transaction(async () => {
            await Account.create({ id: "acc-4", name: "Dave", balance: 5 } as any);
        });
        expect(await Account.find("acc-4")).not.toBeNull();
    });

    it("rolls back a failed transaction — no partial writes survive", async () => {
        await expect(
            db.transaction(async () => {
                await Account.create({ id: "acc-5", name: "Eve", balance: 5 } as any);
                throw new Error("boom");
            })
        ).rejects.toThrow("boom");

        expect(await Account.find("acc-5")).toBeNull();
    });

    it("threads the transaction handle through nested Model calls (read-your-own-write)", async () => {
        const balanceInsideTx = await db.transaction(async () => {
            await Account.create({ id: "acc-6", name: "Frank", balance: 42 } as any);
            const row = await Account.find("acc-6");
            return row?.balance;
        });
        expect(balanceInsideTx).toBe(42);
    });
});
