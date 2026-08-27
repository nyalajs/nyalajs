import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseService } from "../database.service";
import { Model } from "../model";
import { ConnectionContext } from "../connection-context";
import { Table, Primary, StringColumn } from "../schema/decorators";

/**
 * Real, unmocked proof that ConnectionContext actually re-routes Model
 * queries to a genuinely different database connection — two real
 * better-sqlite3 FILES on disk (not in-memory, not mocked), standing in for
 * "the global/shared pool" and "one dedicated tenant's own database". This
 * is the exact mechanism @nyalajs/tenancy's TenantMiddleware uses for
 * dedicated-tenant isolation: it's tested here at the @nyalajs/database
 * layer, independent of tenancy's HTTP/middleware plumbing.
 */
@Table("widgets")
class Widget extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @StringColumn()
    label!: string;
}

describe("ConnectionContext — routes Model queries to a different real connection", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-connection-context-"));
    const globalDbPath = path.join(tmpDir, "global.sqlite");
    const tenantDbPath = path.join(tmpDir, "tenant-acme.sqlite");

    const globalService = new DatabaseService();
    const tenantService = new DatabaseService();

    beforeAll(async () => {
        await globalService.connect({ driver: "better-sqlite3", connectionString: globalDbPath });
        await tenantService.connect({ driver: "better-sqlite3", connectionString: tenantDbPath });

        (globalService.getDb() as any).run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT NOT NULL)");
        (tenantService.getDb() as any).run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT NOT NULL)");

        // Model.db is the GLOBAL default connection — set once, same as any
        // non-multi-tenant app. ConnectionContext is what diverts specific
        // requests away from it, not a replacement for it.
        Model.setDatabase(globalService.getDb());
    });

    afterAll(async () => {
        await globalService.disconnect();
        await tenantService.disconnect();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("with no ConnectionContext active, Model reads/writes the global connection", async () => {
        await Widget.create({ id: "w1", label: "from-global" } as any);

        const fromModel = await Widget.find("w1");
        expect(fromModel?.label).toBe("from-global");

        // Prove it's REALLY the global file, not just what Model claims: a
        // fresh, independent read straight off the global DatabaseService.
        const rawRows = (globalService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'w1'");
        expect(rawRows).toHaveLength(1);

        // And prove it did NOT leak into the tenant DB.
        const tenantRows = (tenantService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'w1'");
        expect(tenantRows).toHaveLength(0);
    });

    it("inside ConnectionContext.run(), Model reads/writes the DEDICATED tenant connection instead — real cross-file isolation", async () => {
        await ConnectionContext.run(tenantService.getDb(), async () => {
            await Widget.create({ id: "w2", label: "from-tenant-acme" } as any);

            const fromModel = await Widget.find("w2");
            expect(fromModel?.label).toBe("from-tenant-acme");
        });

        // The row must exist in the tenant's OWN file...
        const tenantRows = (tenantService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'w2'");
        expect(tenantRows).toHaveLength(1);
        expect(tenantRows[0].label).toBe("from-tenant-acme");

        // ...and must NOT have touched the global file at all.
        const globalRows = (globalService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'w2'");
        expect(globalRows).toHaveLength(0);
    });

    it("ConnectionContext is properly scoped — code running AFTER the run() block reverts to the global connection", async () => {
        await ConnectionContext.run(tenantService.getDb(), async () => {
            await Widget.create({ id: "w3", label: "still-tenant-scoped" } as any);
        });

        // Back on the global connection now (outside the run() callback).
        await Widget.create({ id: "w4", label: "back-to-global" } as any);

        const globalRows = (globalService.getDb() as any).all("SELECT * FROM widgets WHERE id IN ('w3', 'w4')");
        expect(globalRows.map((r: any) => r.id)).toEqual(["w4"]);

        const tenantRows = (tenantService.getDb() as any).all("SELECT * FROM widgets WHERE id IN ('w3', 'w4')");
        expect(tenantRows.map((r: any) => r.id)).toEqual(["w3"]);
    });

    it("concurrent requests on DIFFERENT tenant connections never cross-contaminate — proves AsyncLocalStorage isolation, not a shared mutable flag", async () => {
        const thirdDbPath = path.join(tmpDir, "tenant-globex.sqlite");
        const thirdService = new DatabaseService();
        await thirdService.connect({ driver: "better-sqlite3", connectionString: thirdDbPath });
        (thirdService.getDb() as any).run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT NOT NULL)");

        try {
            // Two "requests" running concurrently, each pinned to its OWN
            // tenant connection via its own ConnectionContext.run() call —
            // if this were a shared mutable variable instead of proper
            // AsyncLocalStorage propagation, these would race and one
            // write would land in the wrong database.
            await Promise.all([
                ConnectionContext.run(tenantService.getDb(), async () => {
                    await new Promise((r) => setTimeout(r, 10));
                    await Widget.create({ id: "race-acme", label: "acme" } as any);
                }),
                ConnectionContext.run(thirdService.getDb(), async () => {
                    await Widget.create({ id: "race-globex", label: "globex" } as any);
                }),
            ]);

            const acmeRows = (tenantService.getDb() as any).all("SELECT * FROM widgets WHERE id LIKE 'race-%'");
            expect(acmeRows.map((r: any) => r.id)).toEqual(["race-acme"]);

            const globexRows = (thirdService.getDb() as any).all("SELECT * FROM widgets WHERE id LIKE 'race-%'");
            expect(globexRows.map((r: any) => r.id)).toEqual(["race-globex"]);
        } finally {
            await thirdService.disconnect();
        }
    });

    it("Model.query() (the fluent QueryBuilder, not just all()/find()) also routes through ConnectionContext — regression check for a real bug where QueryBuilder had its own un-synced copy of connection resolution", async () => {
        await ConnectionContext.run(tenantService.getDb(), async () => {
            await Widget.create({ id: "qb-1", label: "queried-in-tenant" } as any);

            const viaQueryBuilder = await Widget.query().where("id", "qb-1").get();
            expect(viaQueryBuilder).toHaveLength(1);
            expect(viaQueryBuilder[0].label).toBe("queried-in-tenant");
        });

        // Must be in the tenant file, not the global one.
        const tenantRows = (tenantService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'qb-1'");
        expect(tenantRows).toHaveLength(1);
        const globalRows = (globalService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'qb-1'");
        expect(globalRows).toHaveLength(0);

        // And querying it back OUTSIDE the ConnectionContext (global scope)
        // must NOT find it — proves query() isn't accidentally still
        // pinned to the tenant connection after the run() block ends.
        const afterContext = await Widget.query().where("id", "qb-1").get();
        expect(afterContext).toHaveLength(0);
    });

    it("an open transaction still wins over ConnectionContext — a transaction started while dedicated-tenant-scoped stays pinned to that same connection", async () => {
        await ConnectionContext.run(tenantService.getDb(), async () => {
            await tenantService.transaction(async () => {
                await Widget.create({ id: "tx-1", label: "inside-tx" } as any);
            });
        });

        const tenantRows = (tenantService.getDb() as any).all("SELECT * FROM widgets WHERE id = 'tx-1'");
        expect(tenantRows).toHaveLength(1);
    });
});
