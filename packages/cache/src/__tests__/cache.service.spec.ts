import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { CacheService } from "../cache.service";

describe("CacheService (in-memory, no Redis configured)", () => {
    let cache: CacheService;

    beforeEach(async () => {
        cache = new CacheService();
        await cache.connect();
    });

    it("round-trips a JSON-serializable value", async () => {
        await cache.set("user:1", { name: "Alice" });
        expect(await cache.get("user:1")).toEqual({ name: "Alice" });
    });

    it("returns null for a missing key", async () => {
        expect(await cache.get("missing")).toBeNull();
    });

    it("forget() removes a key", async () => {
        await cache.set("k", "v");
        await cache.forget("k");
        expect(await cache.get("k")).toBeNull();
    });

    it("flush() clears everything", async () => {
        await cache.set("a", 1);
        await cache.set("b", 2);
        await cache.flush();
        expect(await cache.get("a")).toBeNull();
        expect(await cache.get("b")).toBeNull();
    });

    it("expires a value after its TTL elapses", async () => {
        await cache.set("short", "value", 0.02); // 20ms
        expect(await cache.get("short")).toBe("value");

        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(await cache.get("short")).toBeNull();
    });

    describe("remember()", () => {
        it("computes and caches on a miss", async () => {
            const factory = () => Promise.resolve("computed");
            const result = await cache.remember("key", 60, factory);
            expect(result).toBe("computed");
            expect(await cache.get("key")).toBe("computed");
        });

        it("returns the cached value without calling factory again on a hit", async () => {
            let calls = 0;
            const factory = () => {
                calls++;
                return Promise.resolve(`call-${calls}`);
            };

            await cache.remember("key", 60, factory);
            const second = await cache.remember("key", 60, factory);

            expect(second).toBe("call-1");
            expect(calls).toBe(1);
        });
    });

    describe("connect() with a url but ioredis not installed", () => {
        it("falls back to the in-memory store instead of throwing", async () => {
            const svc = new CacheService();
            await expect(svc.connect({ url: "redis://localhost:6379" })).resolves.not.toThrow();

            await svc.set("k", "v");
            expect(await svc.get("k")).toBe("v");
        });
    });
});
