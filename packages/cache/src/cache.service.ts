import { Injectable } from "@nyalajs/core";

export interface CacheConfig {
    /** Redis connection string. If omitted, an in-memory store is used. */
    url?: string;
    /** Default TTL in seconds. Defaults to 3600 (1 hour). */
    defaultTtl?: number;
}

type RedisLike = {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, exMode: "EX", ttl: number): Promise<any>;
    del(key: string): Promise<any>;
    flushall(): Promise<any>;
};

/** Lightweight in-memory cache for use without Redis. */
class InMemoryStore implements RedisLike {
    private store = new Map<string, { value: string; expiresAt: number }>();

    async get(key: string): Promise<string | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt < Date.now()) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    async set(key: string, value: string, _exMode: "EX", ttl: number): Promise<any> {
        this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    }

    async del(key: string): Promise<any> {
        this.store.delete(key);
    }

    async flushall(): Promise<any> {
        this.store.clear();
    }
}

@Injectable()
export class CacheService {
    private client!: RedisLike;
    private defaultTtl: number;

    constructor() {
        this.defaultTtl = 3600;
        this.client = new InMemoryStore();
    }

    async connect(config: CacheConfig = {}): Promise<void> {
        this.defaultTtl = config.defaultTtl ?? 3600;

        if (config.url) {
            try {
                // Dynamic import so ioredis is truly optional
                // @ts-ignore — ioredis is a peer dep
                const { default: Redis } = await import("ioredis");
                this.client = new Redis(config.url) as any;
            } catch {
                console.warn(
                    "[nyala/cache] ioredis not installed — falling back to in-memory store."
                );
                this.client = new InMemoryStore();
            }
        } else {
            this.client = new InMemoryStore();
        }
    }

    async get<T = unknown>(key: string): Promise<T | null> {
        const raw = await this.client.get(key);
        if (raw === null) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return raw as unknown as T;
        }
    }

    async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
        const serialized = JSON.stringify(value);
        await this.client.set(key, serialized, "EX", ttl ?? this.defaultTtl);
    }

    async forget(key: string): Promise<void> {
        await this.client.del(key);
    }

    async flush(): Promise<void> {
        await this.client.flushall();
    }

    /** Retrieve from cache or compute + store the value. */
    async remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) return cached;
        const value = await factory();
        await this.set(key, value, ttl);
        return value;
    }
}
