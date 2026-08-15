import { describe, it, expect, vi } from "vitest";
import { RedisDistributedLock, NoopDistributedLock } from "../distributed-lock";

describe("NoopDistributedLock", () => {
    it("always acquires — the pre-locking single-instance behavior", async () => {
        const lock = new NoopDistributedLock();

        expect(await lock.acquire("job-a", 1000)).toBe(true);
        expect(await lock.acquire("job-a", 1000)).toBe(true);
    });
});

describe("RedisDistributedLock", () => {
    function fakeRedis() {
        const store = new Map<string, { value: string; expiresAt: number }>();
        return {
            set: vi.fn(async (key: string, value: string, exToken: string, seconds: number, nxToken: string) => {
                const existing = store.get(key);
                const now = Date.now();
                if (existing && existing.expiresAt > now) {
                    return null; // NX: key already exists and hasn't expired
                }
                store.set(key, { value, expiresAt: now + seconds * 1000 });
                return "OK";
            }),
            _store: store,
        };
    }

    it("acquires the lock when no one else holds it", async () => {
        const redis = fakeRedis();
        const lock = new RedisDistributedLock(redis);

        expect(await lock.acquire("nightly-cleanup", 60000)).toBe(true);
        expect(redis.set).toHaveBeenCalledWith("nyala:scheduler:lock:nightly-cleanup", "1", "EX", 60, "NX");
    });

    it("a second acquire() for the same key fails while the first still holds it", async () => {
        const redis = fakeRedis();
        const lockA = new RedisDistributedLock(redis);
        const lockB = new RedisDistributedLock(redis);

        expect(await lockA.acquire("nightly-cleanup", 60000)).toBe(true);
        expect(await lockB.acquire("nightly-cleanup", 60000)).toBe(false);
    });

    it("different keys don't contend with each other", async () => {
        const redis = fakeRedis();
        const lock = new RedisDistributedLock(redis);

        expect(await lock.acquire("job-a", 60000)).toBe(true);
        expect(await lock.acquire("job-b", 60000)).toBe(true);
    });

    it("rounds a sub-second TTL up to at least 1 second (Redis EX takes whole seconds)", async () => {
        const redis = fakeRedis();
        const lock = new RedisDistributedLock(redis);

        await lock.acquire("fast-job", 500);

        expect(redis.set).toHaveBeenCalledWith(expect.anything(), expect.anything(), "EX", 1, "NX");
    });

    it("can be acquired again once the TTL has expired", async () => {
        vi.useFakeTimers();
        try {
            const redis = fakeRedis();
            const lock = new RedisDistributedLock(redis);

            expect(await lock.acquire("nightly-cleanup", 1000)).toBe(true);
            expect(await lock.acquire("nightly-cleanup", 1000)).toBe(false);

            vi.advanceTimersByTime(1500);

            expect(await lock.acquire("nightly-cleanup", 1000)).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});
