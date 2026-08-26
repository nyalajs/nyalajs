import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseService } from "../database.service";
import { Model } from "../model";
import { Table, Primary, StringColumn, IntColumn } from "../schema/decorators";
import { BelongsToMany } from "../relations/decorators";

/**
 * Real, unmocked exercise of the "mysql2" driver end to end — including the
 * no-RETURNING insert path (Model.insertAndReturn's MySQL branch) and
 * DatabaseService.transaction()'s native async db.transaction() path.
 *
 * Requires a live MySQL server. Skipped unless MYSQL_TEST_URL is set (CI has
 * no MySQL service, so this never runs there) — run locally with e.g.:
 *   docker run --rm -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=nyala_test -p 3306:3306 mysql:8
 *   MYSQL_TEST_URL="mysql://root@127.0.0.1:3306/nyala_test" npx vitest run mysql-integration
 */
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

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

@Table("bm_users")
class BmUser extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;

    @BelongsToMany(() => BmRole, { pivotTable: "bm_user_roles", foreignKey: "userId", relatedPivotKey: "roleId" })
    roles?: BmRole[];
}

@Table("bm_roles")
class BmRole extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;
}

describe.skipIf(!MYSQL_TEST_URL)("DatabaseService — mysql2 driver (live)", () => {
    const db = new DatabaseService();

    beforeAll(async () => {
        await db.connect({ driver: "mysql2", connectionString: MYSQL_TEST_URL! });
        Model.setDatabase(db.getDb());
        await (db.getDb() as any).execute("DROP TABLE IF EXISTS accounts");
        await (db.getDb() as any).execute(
            "CREATE TABLE accounts (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, balance INT NOT NULL)"
        );

        await (db.getDb() as any).execute("DROP TABLE IF EXISTS bm_user_roles");
        await (db.getDb() as any).execute("DROP TABLE IF EXISTS bm_users");
        await (db.getDb() as any).execute("DROP TABLE IF EXISTS bm_roles");
        await (db.getDb() as any).execute("CREATE TABLE bm_users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL)");
        await (db.getDb() as any).execute("CREATE TABLE bm_roles (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL)");
        await (db.getDb() as any).execute(
            "CREATE TABLE bm_user_roles (userId VARCHAR(255) NOT NULL, roleId VARCHAR(255) NOT NULL)"
        );

        await BmUser.create({ id: "u1", name: "Ada" } as any);
        await BmRole.create({ id: "r1", name: "admin" } as any);
        await BmRole.create({ id: "r2", name: "editor" } as any);
        await (db.getDb() as any).execute("INSERT INTO bm_user_roles VALUES ('u1', 'r1')");
        await (db.getDb() as any).execute("INSERT INTO bm_user_roles VALUES ('u1', 'r2')");
    });

    afterAll(async () => {
        await db.disconnect();
    });

    it("reports the mysql dialect", () => {
        expect(db.getDialect()).toBe("mysql");
    });

    it("creates a record with a caller-supplied id (single INSERT + re-select)", async () => {
        const created = await Account.create({ id: "acc-1", name: "Alice", balance: 100 } as any);
        expect(created.name).toBe("Alice");

        const found = await Account.find("acc-1");
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

    it("belongsToMany eager-loads through the pivot table via a raw parameterized query (RelationLoader.execRaw)", async () => {
        const user = await BmUser.find("u1", { with: ["roles"] });
        expect(user?.roles?.map((r) => r.name).sort()).toEqual(["admin", "editor"]);
    });
});
