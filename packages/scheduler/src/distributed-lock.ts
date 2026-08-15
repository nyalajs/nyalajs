/**
 * A lock a scheduled job acquires before running, so that when the same
 * app is deployed as multiple replicas, only one of them actually executes
 * a given tick — without this, every replica's in-process node-cron fires
 * independently and the job runs once per replica, every time.
 */
export interface DistributedLock {
    /**
     * Attempt to acquire the lock for `key`, held for at most `ttlMs`.
     * Returns true if this call acquired it, false if someone else already
     * holds it. The TTL is a safety net against a crashed holder (e.g. the
     * process was killed mid-job) — it is NOT meant to be relied on for
     * jobs that legitimately run longer than the TTL; callers should size
     * the TTL to comfortably exceed the job's expected duration.
     */
    acquire(key: string, ttlMs: number): Promise<boolean>;
}

/**
 * Redis-backed lock via `SET key value EX seconds NX` — atomic
 * acquire-if-absent-with-expiry in one round trip. Every scheduler replica
 * races to acquire the same key each tick; exactly one wins per TTL window.
 */
export class RedisDistributedLock implements DistributedLock {
    constructor(private readonly redis: any) {}

    async acquire(key: string, ttlMs: number): Promise<boolean> {
        const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        const result = await this.redis.set(`nyala:scheduler:lock:${key}`, "1", "EX", ttlSeconds, "NX");
        return result === "OK";
    }
}

/**
 * Always "acquires" — the single-instance behavior every version of this
 * scheduler had before distributed locking existed. Used when no Redis
 * connection is configured; every job still runs, just with no protection
 * against duplicate execution if the app happens to be scaled out anyway.
 */
export class NoopDistributedLock implements DistributedLock {
    async acquire(_key: string, _ttlMs: number): Promise<boolean> {
        return true;
    }
}
