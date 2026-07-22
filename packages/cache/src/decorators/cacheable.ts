import "reflect-metadata";

export const CACHE_METADATA_KEY = "nyala:cache:cacheable";
export const EVICT_METADATA_KEY = "nyala:cache:evict";

/**
 * Cache the return value of a method.
 *
 * @param key   Cache key. If omitted, uses `ClassName.methodName`.
 * @param ttl   TTL in seconds. Falls back to CacheService default.
 *
 * @example
 * @Cacheable("users.all", 300)
 * async findAll() { ... }
 */
export function Cacheable(key?: string, ttl?: number): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const original = descriptor.value;
        const cacheKey = key ?? `${target.constructor.name}.${String(propertyKey)}`;

        descriptor.value = async function (this: any, ...args: any[]) {
            // Resolve CacheService from the DI container attached to `this`,
            // or fall back to a module-level singleton if not available.
            const cache: import("../cache.service").CacheService | undefined =
                this.__cacheService;

            if (!cache) {
                // No cache service wired — execute normally.
                return original.apply(this, args);
            }

            const cached = await cache.get(cacheKey);
            if (cached !== null) return cached;

            const result = await original.apply(this, args);
            await cache.set(cacheKey, result, ttl);
            return result;
        };

        Reflect.defineMetadata(CACHE_METADATA_KEY, { key: cacheKey, ttl }, target, propertyKey);
    };
}

/**
 * Evict (invalidate) a cache entry when this method is called.
 *
 * @param key   Cache key to evict.
 *
 * @example
 * @CacheEvict("users.all")
 * async update(id: string, dto: any) { ... }
 */
export function CacheEvict(key: string): MethodDecorator {
    return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const original = descriptor.value;

        descriptor.value = async function (this: any, ...args: any[]) {
            const result = await original.apply(this, args);

            const cache: import("../cache.service").CacheService | undefined =
                this.__cacheService;

            if (cache) {
                await cache.forget(key);
            }

            return result;
        };

        Reflect.defineMetadata(EVICT_METADATA_KEY, { key }, target, propertyKey);
    };
}
