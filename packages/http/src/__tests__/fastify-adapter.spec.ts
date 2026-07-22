import { describe, it, expect, vi } from "vitest";
import { FastifyAdapter } from "../runtime/fastify-adapter";

describe("FastifyAdapter", () => {
    it("initializes without errors", () => {
        const mockContainer = {
            createRequestScope: vi.fn(),
            resolve: vi.fn()
        } as any;
        const adapter = new FastifyAdapter(mockContainer);
        expect(adapter).toBeDefined();
    });

    it("registers middleware in the correct order", () => {
        const mockContainer = {
            createRequestScope: vi.fn(),
            resolve: vi.fn()
        } as any;
        const adapter = new FastifyAdapter(mockContainer);
        
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
});
