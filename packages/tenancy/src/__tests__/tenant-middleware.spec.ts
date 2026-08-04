import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { TenantContext } from "@nyalajs/core";
import { BadRequestException } from "@nyalajs/http";
import { TenantMiddleware } from "../middleware/tenant.middleware";
import { TenantResolver } from "../resolvers/tenant-resolver.interface";

function resolver(value: string | undefined): TenantResolver {
    return { resolve: async () => value };
}

describe("TenantMiddleware", () => {
    it("publishes the first resolver's non-empty result via TenantContext", async () => {
        const middleware = new TenantMiddleware([resolver(undefined), resolver("tenant-a")], false);
        const next = vi.fn().mockResolvedValue(undefined);

        await TenantContext.run(async () => {
            await middleware.use({}, {}, next);
            expect(TenantContext.get()).toBe("tenant-a");
        });

        expect(next).toHaveBeenCalledOnce();
    });

    it("stops at the first resolver that resolves a tenant, ignoring later ones", async () => {
        const secondResolver = resolver("tenant-b");
        const secondSpy = vi.spyOn(secondResolver, "resolve");
        const middleware = new TenantMiddleware([resolver("tenant-a"), secondResolver], false);

        await TenantContext.run(async () => {
            await middleware.use({}, {}, vi.fn());
            expect(TenantContext.get()).toBe("tenant-a");
        });

        expect(secondSpy).not.toHaveBeenCalled();
    });

    it("calls next() with no tenant resolved when tenant is not required", async () => {
        const middleware = new TenantMiddleware([resolver(undefined)], false);
        const next = vi.fn().mockResolvedValue(undefined);

        await TenantContext.run(async () => {
            await middleware.use({}, {}, next);
            expect(TenantContext.get()).toBeUndefined();
        });

        expect(next).toHaveBeenCalledOnce();
    });

    it("throws BadRequestException when tenant is required but none resolved", async () => {
        const middleware = new TenantMiddleware([resolver(undefined)], true);
        const next = vi.fn().mockResolvedValue(undefined);

        await TenantContext.run(async () => {
            await expect(middleware.use({}, {}, next)).rejects.toThrow(BadRequestException);
        });

        expect(next).not.toHaveBeenCalled();
    });
});
