import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { Model } from "../model";
import { Table, Primary, StringColumn, Column } from "../schema/decorators";

@Table("posts")
class Post extends Model {
    @Primary()
    @StringColumn()
    id!: string;

    @Column({ name: "tenant_id" })
    tenantId!: string;

    @StringColumn()
    title!: string;
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
        then: (resolve: any) => resolve(rows), // makes the chain itself awaitable
    };
    const insertChain = {
        values: (data: any) => ({
            returning: () => Promise.resolve([{ id: "new-id", ...data }]),
        }),
    };
    return {
        select: () => selectChain,
        insert: () => insertChain,
        getCapturedWhere: () => capturedWhere,
    };
}

describe("Model tenant scoping", () => {
    beforeEach(() => {
        (Post as any).db = fakeDb();
    });

    it("throws when reading a tenant-scoped model with no active tenant", async () => {
        await expect(Post.all()).rejects.toThrow(/Tenant context required/);
    });

    it("applies a tenant filter and succeeds when a tenant is active", async () => {
        const db = fakeDb([{ id: "1", tenantId: "tenant-a", title: "hi" }]);
        (Post as any).db = db;

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const posts = await Post.all();
            expect(posts).toHaveLength(1);
        });

        expect(db.getCapturedWhere()).toBeDefined();
    });

    it("isolates tenants from each other via TenantContext", async () => {
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            expect(TenantContext.get()).toBe("tenant-a");
        });

        await TenantContext.run(async () => {
            // A fresh ALS scope must not leak the previous tenant.
            expect(TenantContext.get()).toBeUndefined();
        });
    });

    it("throws on create() for a tenant-scoped model with no active tenant", async () => {
        await expect(Post.create({ title: "hi" } as any)).rejects.toThrow(/Tenant context required/);
    });

    it("auto-stamps tenant_id on create() when a tenant is active", async () => {
        const db = fakeDb();
        (Post as any).db = db;

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            const post = await Post.create({ title: "hi" } as any);
            expect((post as any).tenantId).toBe("tenant-b");
        });
    });
});
