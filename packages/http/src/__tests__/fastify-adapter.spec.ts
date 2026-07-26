import { describe, it, expect, vi, afterEach } from "vitest";
import { FastifyAdapter } from "../runtime/fastify-adapter";

function mockContainer() {
    return {
        createRequestScope: vi.fn(),
        resolve: vi.fn()
    } as any;
}

describe("FastifyAdapter", () => {
    it("initializes without errors when sessions are disabled", () => {
        const adapter = new FastifyAdapter(mockContainer(), { session: false });
        expect(adapter).toBeDefined();
    });

    it("registers middleware in the correct order", () => {
        const adapter = new FastifyAdapter(mockContainer(), { session: false });

        let order: string[] = [];

        const mw1 = {
            use: async (req: any, res: any, next: any) => {
                order.push("mw1");
                await next();
            }
        };

        const mw2 = {
            use: async (req: any, res: any, next: any) => {
                order.push("mw2");
                await next();
            }
        };

        adapter.addMiddleware(mw1);
        adapter.addMiddleware(mw2);

        // This is a unit test of the adapter state; actual execution is harder
        // to test without full Fastify instance spinup.
        expect((adapter as any).globalMiddleware).toHaveLength(2);
        expect((adapter as any).globalMiddleware[0]).toBe(mw1);
    });

    describe("session secret/salt", () => {
        const originalSecret = process.env.SESSION_SECRET;
        const originalSalt = process.env.SESSION_SALT;

        afterEach(() => {
            process.env.SESSION_SECRET = originalSecret;
            process.env.SESSION_SALT = originalSalt;
        });

        it("throws instead of defaulting when SESSION_SECRET is unset", () => {
            delete process.env.SESSION_SECRET;
            delete process.env.SESSION_SALT;

            expect(() => new FastifyAdapter(mockContainer())).toThrow(/SESSION_SECRET/);
        });

        it("throws when SESSION_SALT is missing or the wrong length", () => {
            process.env.SESSION_SECRET = "a".repeat(32);
            delete process.env.SESSION_SALT;

            expect(() => new FastifyAdapter(mockContainer())).toThrow(/SESSION_SALT/);
        });

        it("succeeds when both SESSION_SECRET and SESSION_SALT are valid", () => {
            process.env.SESSION_SECRET = "a".repeat(32);
            process.env.SESSION_SALT = "1234567890123456";

            expect(() => new FastifyAdapter(mockContainer())).not.toThrow();
        });
    });

    describe("default CORS", () => {
        it("does not reflect a cross-origin request's Origin header by default", async () => {
            const adapter = new FastifyAdapter(mockContainer(), { session: false, csrf: false });
            const instance = adapter.getInstance();
            instance.get("/ping", async () => ({ ok: true }));

            const res = await instance.inject({
                method: "GET",
                url: "/ping",
                headers: { origin: "https://evil.example" },
            });

            expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        });

        it("reflects the Origin only when corsOrigin is explicitly configured", async () => {
            const adapter = new FastifyAdapter(mockContainer(), {
                session: false,
                csrf: false,
                corsOrigin: "https://trusted.example",
            });
            const instance = adapter.getInstance();
            instance.get("/ping", async () => ({ ok: true }));

            const res = await instance.inject({
                method: "GET",
                url: "/ping",
                headers: { origin: "https://trusted.example" },
            });

            expect(res.headers["access-control-allow-origin"]).toBe("https://trusted.example");
        });
    });
});
