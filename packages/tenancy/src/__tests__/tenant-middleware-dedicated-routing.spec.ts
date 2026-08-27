import "reflect-metadata";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { DatabaseService, Model, Table, Primary, StringColumn, Column } from "@nyalajs/database";
import { TenantMiddleware } from "../middleware/tenant.middleware";
import { TenantResolver } from "../resolvers/tenant-resolver.interface";
import { TenantRegistry } from "../registry/tenant-registry.service";
import { TenantConnectionManager } from "../connection/tenant-connection-manager";

/**
 * Real, unmocked end-to-end proof that TenantMiddleware's new
 * registry/connection-manager wiring actually routes a REQUEST's Model
 * calls to the right physical database — real SQLite files standing in for
 * "the shared DB" and "tenant X's own dedicated DB", real TenantMiddleware,
 * a real handler function reading through Model in between.
 */
@Table("tickets")
class Ticket extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @Column({ name: "tenant_id" })
    tenantId!: string;

    @StringColumn(200)
    subject!: string;
}

function resolver(value: string | undefined): TenantResolver {
    return { resolve: async () => value };
}

describe("TenantMiddleware — real dedicated-tenant connection routing end to end", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nyala-middleware-routing-"));
    const sharedDbPath = path.join(tmpDir, "shared.sqlite");
    const dedicatedDbPath = path.join(tmpDir, "dedicated-widgetco.sqlite");

    const sharedService = new DatabaseService();
    let registry: TenantRegistry;
    let connections: TenantConnectionManager;

    beforeAll(async () => {
        await sharedService.connect({ driver: "better-sqlite3", connectionString: sharedDbPath });
        Model.setDatabase(sharedService.getDb());

        (sharedService.getDb() as any).run(
            "CREATE TABLE IF NOT EXISTS nyala_tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, isolationMode TEXT NOT NULL, connectionString TEXT, driver TEXT, migrationStatus TEXT NOT NULL, createdAt INTEGER, updatedAt INTEGER)"
        );
        (sharedService.getDb() as any).run("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject TEXT NOT NULL)");

        registry = new TenantRegistry(0);
        connections = new TenantConnectionManager();

        await registry.register({ id: "shared-co", name: "Shared Co" });
        await registry.register({
            id: "widgetco",
            name: "Widget Co",
            isolationMode: "dedicated",
            connectionString: dedicatedDbPath,
            driver: "better-sqlite3",
        });

        // widgetco's own dedicated file, same schema, seeded independently
        // of the shared file — a real second database, not a partition.
        const dedicatedDb = await connections.getConnection((await registry.findOrThrow("widgetco")));
        (dedicatedDb as any).run("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, subject TEXT NOT NULL)");
    });

    afterAll(async () => {
        await connections.closeAll();
        await sharedService.disconnect();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    async function seed(tenantId: string, connectionOverride: any | undefined, subjects: string[]): Promise<void> {
        const { ConnectionContext } = await import("@nyalajs/database");
        const run = async () => {
            await TenantContext.run(async () => {
                TenantContext.set(tenantId);
                for (const subject of subjects) {
                    await Ticket.create({ id: `${tenantId}-${subject}`, subject } as any);
                }
            });
        };
        if (connectionOverride) {
            await ConnectionContext.run(connectionOverride, run);
        } else {
            await run();
        }
    }

    it("a request for a SHARED tenant reads/writes the normal global connection — TenantMiddleware doesn't push any ConnectionContext override", async () => {
        await seed("shared-co", undefined, ["billing question"]);

        const middleware = new TenantMiddleware([resolver("shared-co")], false, registry, connections);
        let ticketsSeenInHandler: any[] = [];

        await TenantContext.run(async () => {
            await middleware.use({}, {}, async () => {
                ticketsSeenInHandler = await Ticket.query().get();
            });
        });

        expect(ticketsSeenInHandler).toHaveLength(1);
        expect(ticketsSeenInHandler[0].subject).toBe("billing question");

        // Confirm it's really the SHARED file's row, via a raw independent read.
        const raw = (sharedService.getDb() as any).all("SELECT * FROM tickets WHERE tenant_id = 'shared-co'");
        expect(raw).toHaveLength(1);
    });

    it("a request for a DEDICATED tenant transparently routes the handler's Model calls to that tenant's own database", async () => {
        const widgetcoDb = await connections.getConnection(await registry.findOrThrow("widgetco"));
        await seed("widgetco", widgetcoDb, ["login broken"]);

        const middleware = new TenantMiddleware([resolver("widgetco")], false, registry, connections);
        let ticketsSeenInHandler: any[] = [];

        await TenantContext.run(async () => {
            await middleware.use({}, {}, async () => {
                // The handler does NOTHING special — just calls Model
                // normally, exactly like the shared-tenant case above.
                ticketsSeenInHandler = await Ticket.query().get();
            });
        });

        expect(ticketsSeenInHandler).toHaveLength(1);
        expect(ticketsSeenInHandler[0].subject).toBe("login broken");

        // Confirm it's really the DEDICATED file, not the shared one.
        const dedicatedRaw = (widgetcoDb as any).all("SELECT * FROM tickets");
        expect(dedicatedRaw).toHaveLength(1);
        const sharedRaw = (sharedService.getDb() as any).all("SELECT * FROM tickets WHERE tenant_id = 'widgetco'");
        expect(sharedRaw).toHaveLength(0);
    });

    it("after the dedicated-tenant request completes, TenantContext/ConnectionContext are fully unwound — a following SHARED-tenant request on the same process is unaffected", async () => {
        const dedicatedMiddleware = new TenantMiddleware([resolver("widgetco")], false, registry, connections);
        await TenantContext.run(async () => {
            await dedicatedMiddleware.use({}, {}, async () => {
                await Ticket.create({ id: "widgetco-leak-check", subject: "should stay dedicated" } as any);
            });
        });

        // A completely separate "request" for the shared tenant right after.
        const sharedMiddleware = new TenantMiddleware([resolver("shared-co")], false, registry, connections);
        let seenInSharedRequest: any[] = [];
        await TenantContext.run(async () => {
            await sharedMiddleware.use({}, {}, async () => {
                seenInSharedRequest = await Ticket.query().where("id", "widgetco-leak-check").get();
            });
        });

        expect(seenInSharedRequest).toHaveLength(0); // must NOT see widgetco's dedicated-DB row
    });

    it("a tenant id resolved but NOT present in the registry falls back to shared/global-connection behavior instead of blocking the request", async () => {
        const middleware = new TenantMiddleware([resolver("totally-unregistered-tenant")], false, registry, connections);
        let handlerRan = false;

        await TenantContext.run(async () => {
            await middleware.use({}, {}, async () => {
                handlerRan = true;
                // Must resolve against the GLOBAL connection without throwing.
                await Ticket.query().get();
            });
        });

        expect(handlerRan).toBe(true);
    });

    it("with NO registry/connections wired in at all (both undefined), behaves exactly like the original TenantMiddleware — pure backward compatibility", async () => {
        const middleware = new TenantMiddleware([resolver("shared-co")], false);
        let handlerRan = false;

        await TenantContext.run(async () => {
            await middleware.use({}, {}, async () => {
                handlerRan = true;
                expect(TenantContext.get()).toBe("shared-co");
            });
        });

        expect(handlerRan).toBe(true);
    });
});
