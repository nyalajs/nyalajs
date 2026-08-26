import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseService } from "../database.service";
import { Model } from "../model";
import { Table, Primary, StringColumn, IntColumn } from "../schema/decorators";
import { BelongsToMany } from "../relations/decorators";

/**
 * Real, unmocked exercise of both Postgres drivers ("pg" and "postgres")
 * end to end against the same live server — the default driver this
 * package originally hardcoded, so this is the highest-value regression
 * check for the multi-driver refactor.
 *
 * Requires a live Postgres server. Skipped unless POSTGRES_TEST_URL is set
 * (CI has no Postgres service configured for this suite, so it never runs
 * there) — run locally with e.g.:
 *   docker run --rm -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=nyala_test -p 5432:5432 postgres:16-alpine
 *   POSTGRES_TEST_URL="postgres://postgres@127.0.0.1:5432/nyala_test" npx vitest run postgres-integration
 */
const POSTGRES_TEST_URL = process.env.POSTGRES_TEST_URL;

function accountModel(tableName: string) {
    @Table(tableName)
    class Account extends Model {
        @Primary()
        @StringColumn()
        id!: string;

        @StringColumn()
        name!: string;

        @IntColumn()
        balance!: number;
    }
    return Account;
}

function runSuite(driver: "pg" | "postgres", tableName: string) {
    describe.skipIf(!POSTGRES_TEST_URL)(`DatabaseService — ${driver} driver (live)`, () => {
        const db = new DatabaseService();
        const Account = accountModel(tableName);

        // belongsToMany's tables — separate per driver run (same suffix
        // scheme as `tableName`) since both drivers share one live database.
        const usersTable = `bm_users_${driver}`;
        const rolesTable = `bm_roles_${driver}`;
        const pivotTable = `bm_user_roles_${driver}`;

        @Table(usersTable)
        class BmUser extends Model {
            @Primary() @StringColumn() id!: string;
            @StringColumn() name!: string;

            @BelongsToMany(() => BmRole, { pivotTable, foreignKey: "userId", relatedPivotKey: "roleId" })
            roles?: BmRole[];
        }

        @Table(rolesTable)
        class BmRole extends Model {
            @Primary() @StringColumn() id!: string;
            @StringColumn() name!: string;
        }

        beforeAll(async () => {
            await db.connect({ driver, connectionString: POSTGRES_TEST_URL! });
            Model.setDatabase(db.getDb());
            await (db.getDb() as any).execute(`DROP TABLE IF EXISTS ${tableName}`);
            await (db.getDb() as any).execute(
                `CREATE TABLE ${tableName} (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, balance INTEGER NOT NULL)`
            );

            await (db.getDb() as any).execute(`DROP TABLE IF EXISTS ${pivotTable}`);
            await (db.getDb() as any).execute(`DROP TABLE IF EXISTS ${usersTable}`);
            await (db.getDb() as any).execute(`DROP TABLE IF EXISTS ${rolesTable}`);
            await (db.getDb() as any).execute(
                `CREATE TABLE ${usersTable} (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL)`
            );
            await (db.getDb() as any).execute(
                `CREATE TABLE ${rolesTable} (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL)`
            );
            await (db.getDb() as any).execute(
                `CREATE TABLE ${pivotTable} ("userId" VARCHAR(255) NOT NULL, "roleId" VARCHAR(255) NOT NULL)`
            );

            await BmUser.create({ id: "u1", name: "Ada" } as any);
            await BmRole.create({ id: "r1", name: "admin" } as any);
            await BmRole.create({ id: "r2", name: "editor" } as any);
            await (db.getDb() as any).execute(`INSERT INTO ${pivotTable} VALUES ('u1', 'r1')`);
            await (db.getDb() as any).execute(`INSERT INTO ${pivotTable} VALUES ('u1', 'r2')`);
        });

        afterAll(async () => {
            await db.disconnect();
        });

        it("reports the postgres dialect", () => {
            expect(db.getDialect()).toBe("postgres");
        });

        it("creates and finds a record via .returning()", async () => {
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
}

runSuite("pg", "accounts_pg");
runSuite("postgres", "accounts_postgresjs");
