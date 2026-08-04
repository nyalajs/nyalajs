import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { Model, Table, Primary, StringColumn, Column } from "@nyalajs/database";
import { TenantRepository } from "../repository/tenant-repository";

@Table("invoices")
class Invoice extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @Column({ name: "tenant_id" })
    tenantId!: string;

    @StringColumn()
    description!: string;
}

class InvoiceRepository extends TenantRepository<Invoice> {
    protected readonly model = Invoice;
}

function fakeDb(rows: any[] = []) {
    let capturedWhere: any;
    const selectChain = {
        from: () => selectChain,
        where: (cond: any) => {
            capturedWhere = cond;
            return selectChain;
        },
        limit: () => Promise.resolve(rows),
        then: (resolve: any) => resolve(rows),
    };
    return {
        select: () => selectChain,
        insert: () => ({
            values: (data: any) => ({
                returning: () => Promise.resolve([{ id: data.id ?? "new-id", ...data }]),
            }),
        }),
        update: () => ({
            set: () => ({ where: () => Promise.resolve() }),
        }),
        delete: () => ({
            where: () => Promise.resolve(),
        }),
        getCapturedWhere: () => capturedWhere,
    };
}

describe("TenantRepository (Model-backed)", () => {
    let repo: InvoiceRepository;

    beforeEach(() => {
        repo = new InvoiceRepository();
        (Invoice as any).db = fakeDb();
    });

    describe("without an active tenant — fails closed", () => {
        it("find() rejects", async () => {
            await expect(repo.find()).rejects.toThrow(/Tenant context required/);
        });

        it("findOne() rejects", async () => {
            await expect(repo.findOne("inv-1")).rejects.toThrow(/Tenant context required/);
        });

        it("create() rejects", async () => {
            await expect(repo.create({ description: "hi" } as any)).rejects.toThrow(/Tenant context required/);
        });

        it("ensureTenant()/getTenantId() throw via the repository's own guard", () => {
            expect(() => (repo as any).ensureTenant()).toThrow(/Tenant context required/);
            expect(() => (repo as any).getTenantId()).toThrow(/Tenant context required/);
        });
    });

    describe("with an active tenant", () => {
        it("create() auto-stamps tenant_id", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const invoice = await repo.create({ description: "hi" } as any);
                expect((invoice as any).tenantId).toBe("tenant-a");
            });
        });

        it("find() applies a tenant filter", async () => {
            const db = fakeDb([{ id: "inv-1", tenantId: "tenant-a", description: "hi" }]);
            (Invoice as any).db = db;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const invoices = await repo.find();
                expect(invoices).toHaveLength(1);
            });

            expect(db.getCapturedWhere()).toBeDefined();
        });

        it("getTenantId() returns the active tenant", async () => {
            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                expect((repo as any).getTenantId()).toBe("tenant-a");
            });
        });

        it("update() finds then saves the record", async () => {
            const db = fakeDb([{ id: "inv-1", tenantId: "tenant-a", description: "old" }]);
            (Invoice as any).db = db;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                const updated = await repo.update("inv-1", { description: "new" } as any);
                expect((updated as any).description).toBe("new");
            });
        });

        it("delete() finds then deletes the record", async () => {
            const db = fakeDb([{ id: "inv-1", tenantId: "tenant-a", description: "hi" }]);
            (Invoice as any).db = db;

            await TenantContext.run(async () => {
                TenantContext.set("tenant-a");
                await expect(repo.delete("inv-1")).resolves.toBeUndefined();
            });
        });
    });
});
