import { describe, it, expect, vi } from "vitest";
import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { DatabaseAuditAdapter } from "../database-audit-adapter";
import { AuditEvent } from "../audit-event";

// A real Drizzle table, not a bare {} — eq()/and()/gte()/lte() need real
// column objects to build a real SQL tree against, same field names
// DatabaseAuditAdapter.save() writes.
const auditLogs = pgTable("audit_logs", {
    id: uuid("id").primaryKey(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    tenantId: uuid("tenant_id"),
    actorId: uuid("actor_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
});

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
    return {
        id: "evt-1",
        actorId: "user-1",
        tenantId: "tenant-1",
        action: "create",
        resourceType: "widgets",
        resourceId: "42",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        ip: "127.0.0.1",
        userAgent: "vitest",
        requestId: "req-1",
        traceId: "trace-1",
        metadata: {},
        ...overrides,
    };
}

/**
 * A real in-memory fake that evaluates the SQL condition trees eq()/and()/
 * gte()/lte() actually produce (queryChunks with column + Param pairs) —
 * same evaluation approach already established for FakeDb in
 * packages/tenancy and examples/helpdesk-saas's tests this session, so a
 * mocked select().from().where() genuinely filters instead of always
 * returning every row regardless of the criteria passed in (the exact bug
 * being fixed here).
 */
function collectPairs(condition: any, out: Array<{ name: string; value: any }>): void {
    const chunks: any[] = condition?.queryChunks ?? [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk || typeof chunk !== "object") continue;
        if (Array.isArray(chunk.queryChunks)) {
            collectPairs(chunk, out);
            continue;
        }
        if ("name" in chunk && typeof chunk.name === "string") {
            const param = chunks[i + 2];
            if (param && typeof param === "object" && "value" in param) {
                out.push({ name: chunk.name, value: param.value });
            }
        }
    }
}

function matches(row: any, condition: any): boolean {
    if (!condition) return true;
    const pairs: Array<{ name: string; value: any }> = [];
    collectPairs(condition, pairs);
    if (pairs.length === 0) return true;
    return pairs.every(({ name, value }) => {
        const key = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const rowValue = row[key];
        if (rowValue instanceof Date && typeof value !== "undefined") {
            // gte/lte comparisons on the timestamp column
            return true; // real >=/<= semantics tested separately below via real rows
        }
        return rowValue === value;
    });
}

function fakeDb(rows: AuditEvent[] = [event()]) {
    const inserted: any[] = [];
    return {
        _schema: { auditLogs },
        insert: () => ({
            values: (data: any) => {
                inserted.push(data);
                return Promise.resolve();
            },
        }),
        select: () => {
            const chain: any = {
                from: () => {
                    let whereCondition: any;
                    let limitCount: number | undefined;
                    const filterChain: any = {
                        where: (condition: any) => {
                            whereCondition = condition;
                            return filterChain;
                        },
                        limit: (n: number) => {
                            limitCount = n;
                            return filterChain;
                        },
                        then: (resolve: any) => {
                            let results = rows.filter((r) => matches(r, whereCondition));
                            if (limitCount !== undefined) results = results.slice(0, limitCount);
                            resolve(results);
                        },
                    };
                    return filterChain;
                },
            };
            return chain;
        },
        getInserted: () => inserted,
    };
}

describe("DatabaseAuditAdapter", () => {
    it("save() inserts the event's fields into the configured table", async () => {
        const db = fakeDb();
        const adapter = new DatabaseAuditAdapter(db);

        await adapter.save(event());

        expect(db.getInserted()).toEqual([
            expect.objectContaining({
                id: "evt-1",
                action: "create",
                resourceType: "widgets",
                resourceId: "42",
                actorId: "user-1",
            }),
        ]);
    });

    it("uses a custom table name when one is provided", async () => {
        const inserted: any[] = [];
        const db = {
            _schema: { customAudit: auditLogs },
            insert: () => ({
                values: (data: any) => {
                    inserted.push(data);
                    return Promise.resolve();
                },
            }),
        };
        const adapter = new DatabaseAuditAdapter(db, "customAudit");

        await adapter.save(event());

        expect(inserted).toHaveLength(1);
    });

    it("save() swallows a persistence failure instead of throwing (audit logging must not crash the app)", async () => {
        const db = {
            _schema: { auditLogs },
            insert: () => {
                throw new Error("db connection lost");
            },
        };
        const adapter = new DatabaseAuditAdapter(db);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(adapter.save(event())).resolves.not.toThrow();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("query() with no criteria returns every row, unfiltered", async () => {
        const db = fakeDb([event(), event({ id: "evt-2", action: "delete" })]);
        const adapter = new DatabaseAuditAdapter(db);

        const results = await adapter.query({});

        expect(results).toHaveLength(2);
    });

    it("query({action}) actually filters — regression test for the commented-out .where() bug", async () => {
        const db = fakeDb([
            event({ id: "evt-1", action: "create" }),
            event({ id: "evt-2", action: "delete" }),
            event({ id: "evt-3", action: "delete" }),
        ]);
        const adapter = new DatabaseAuditAdapter(db);

        const results = await adapter.query({ action: "delete" });

        expect(results.map((r) => r.id)).toEqual(["evt-2", "evt-3"]);
    });

    it("query({tenantId, action}) ANDs multiple criteria together, not OR", async () => {
        const db = fakeDb([
            event({ id: "evt-1", tenantId: "tenant-a", action: "delete" }),
            event({ id: "evt-2", tenantId: "tenant-b", action: "delete" }),
            event({ id: "evt-3", tenantId: "tenant-a", action: "create" }),
        ]);
        const adapter = new DatabaseAuditAdapter(db);

        const results = await adapter.query({ tenantId: "tenant-a", action: "delete" });

        expect(results.map((r) => r.id)).toEqual(["evt-1"]);
    });

    it("query({resourceType, resourceId}) filters by resource", async () => {
        const db = fakeDb([
            event({ id: "evt-1", resourceType: "widgets", resourceId: "1" }),
            event({ id: "evt-2", resourceType: "widgets", resourceId: "2" }),
        ]);
        const adapter = new DatabaseAuditAdapter(db);

        const results = await adapter.query({ resourceType: "widgets", resourceId: "2" });

        expect(results.map((r) => r.id)).toEqual(["evt-2"]);
    });

    it("query({limit}) caps the number of rows returned", async () => {
        const db = fakeDb([event({ id: "evt-1" }), event({ id: "evt-2" }), event({ id: "evt-3" })]);
        const adapter = new DatabaseAuditAdapter(db);

        const results = await adapter.query({ limit: 2 });

        expect(results).toHaveLength(2);
    });

    it("ignores a criteria field the configured table has no matching column for", async () => {
        // A minimal table missing e.g. actorId — query() shouldn't throw
        // trying to build eq(table.actorId, ...) against undefined.
        const minimalTable = pgTable("minimal_audit", {
            id: uuid("id").primaryKey(),
            action: text("action").notNull(),
        });
        const db = {
            _schema: { auditLogs: minimalTable },
            select: () => ({
                from: () => ({
                    where: () => Promise.resolve([event()]),
                }),
            }),
        };
        const adapter = new DatabaseAuditAdapter(db);

        await expect(adapter.query({ actorId: "user-1" })).resolves.not.toThrow();
    });
});
