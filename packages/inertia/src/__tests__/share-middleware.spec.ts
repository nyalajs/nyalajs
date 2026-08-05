import { describe, it, expect, vi } from "vitest";
import { InertiaShareMiddleware } from "../share-middleware";
import { getSharedProps } from "../shared-props";

describe("InertiaShareMiddleware", () => {
    it("calls the resolver and merges its result into the request's shared props", async () => {
        const req: any = { session: { get: () => ({ id: 1, name: "Ada" }) } };
        const middleware = new InertiaShareMiddleware((r) => ({ user: r.session.get() }));
        const next = vi.fn(async () => {});

        await middleware.use(req, {}, next);

        expect(getSharedProps(req)).toEqual({ user: { id: 1, name: "Ada" } });
    });

    it("supports an async resolver", async () => {
        const req: any = {};
        const middleware = new InertiaShareMiddleware(async () => {
            return { user: await Promise.resolve({ id: 1 }) };
        });
        const next = vi.fn(async () => {});

        await middleware.use(req, {}, next);

        expect(getSharedProps(req)).toEqual({ user: { id: 1 } });
    });

    it("calls next() so the middleware chain continues", async () => {
        const req: any = {};
        const middleware = new InertiaShareMiddleware(() => ({}));
        const next = vi.fn(async () => {});

        await middleware.use(req, {}, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it("calls next() after resolving props, so later middleware sees them", async () => {
        const req: any = {};
        const order: string[] = [];
        const middleware = new InertiaShareMiddleware(() => {
            order.push("resolved");
            return { user: { id: 1 } };
        });
        const next = vi.fn(async () => {
            order.push("next");
        });

        await middleware.use(req, {}, next);

        expect(order).toEqual(["resolved", "next"]);
    });
});
