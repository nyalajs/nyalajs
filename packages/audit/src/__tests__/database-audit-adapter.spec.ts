import { describe, it, expect, vi } from "vitest";
import { DatabaseAuditAdapter } from "../database-audit-adapter";
import { AuditEvent } from "../audit-event";

function event(): AuditEvent {
    return {
        id: "evt-1",
        actorId: "user-1",
        action: "create",
        resourceType: "widgets",
        resourceId: "42",
        timestamp: new Date("2024-01-01T00:00:00Z"),
        ip: "127.0.0.1",
        userAgent: "vitest",
        requestId: "req-1",
        traceId: "trace-1",
        metadata: {},
    };
}

function fakeDb(table: any = {}) {
    const inserted: any[] = [];
    return {
        _schema: { auditLogs: table },
        insert: () => ({
            values: (data: any) => {
                inserted.push(data);
                return Promise.resolve();
            },
        }),
        select: () => ({ from: () => Promise.resolve([event()]) }),
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
            _schema: { customAudit: {} },
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
            _schema: { auditLogs: {} },
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

    it("query() selects from the configured table", async () => {
        const db = fakeDb();
        const adapter = new DatabaseAuditAdapter(db);

        const results = await adapter.query({});

        expect(results).toEqual([event()]);
    });
});
