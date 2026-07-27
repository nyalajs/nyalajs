# Caching

Nyala provides a Redis-backed `CacheService` from `@nyalajs/cache`, with an automatic in-memory fallback when Redis isn't configured — so caching works out of the box in development and tests without any external dependency.

## Quick Start

Inject `CacheService` into any provider and call `get`/`set` directly:

```typescript
import { Injectable } from '@nyalajs/core';
import { CacheService } from '@nyalajs/cache';

@Injectable()
export class ProductsService {
  constructor(
    private productsRepo: ProductsRepository,
    private cache: CacheService
  ) {}

  async findAll() {
    const cached = await this.cache.get<Product[]>('products.all');
    if (cached) return cached;

    const products = await this.productsRepo.findAll();
    await this.cache.set('products.all', products, 300); // TTL in seconds

    return products;
  }
}
```

## Cache Configuration

`CacheService` starts up with an in-memory store by default. Call `connect()` during bootstrap to point it at Redis instead:

```typescript
export interface CacheConfig {
  /** Redis connection string. If omitted, an in-memory store is used. */
  url?: string;
  /** Default TTL in seconds. Defaults to 3600 (1 hour). */
  defaultTtl?: number;
}
```

```typescript
// main.ts
async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);
  const cache = app.get(CacheService);

  await cache.connect({
    url: process.env.REDIS_URL,
    defaultTtl: 3600,
  });

  await app.listen(3000);
}
```

If `url` is omitted — or the `ioredis` package isn't installed — `CacheService` falls back to an in-memory `Map`-backed store and logs a warning:

```
[nyala/cache] ioredis not installed — falling back to in-memory store.
```

This makes `ioredis` an optional peer dependency: install it in production for a shared Redis cache, and skip it entirely for local development or unit tests where an in-memory store is enough.

```env
# .env
REDIS_URL=redis://localhost:6379
```

## CacheService API

```typescript
export class CacheService {
  connect(config?: CacheConfig): Promise<void>;
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  forget(key: string): Promise<void>;
  flush(): Promise<void>;
  remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T>;
}
```

- **`get(key)`** — returns the cached value, JSON-deserialized, or `null` if missing or expired.
- **`set(key, value, ttl?)`** — JSON-serializes and stores `value`. `ttl` is in seconds; if omitted, falls back to the `defaultTtl` set via `connect()` (3600 by default).
- **`forget(key)`** — deletes a single key.
- **`flush()`** — clears the entire cache (all keys).
- **`remember(key, ttl, factory)`** — the cache-aside helper: returns the cached value if present, otherwise calls `factory()`, stores the result, and returns it.

### Basic Get/Set

```typescript
await this.cache.set('user:123', user, 600); // Expires in 10 minutes
const user = await this.cache.get<User>('user:123');
```

### Cache-Aside with `remember()`

`remember()` collapses the "check cache, else compute and store" pattern into one call:

```typescript
@Injectable()
export class ProductsService {
  constructor(
    private productsRepo: ProductsRepository,
    private cache: CacheService
  ) {}

  async findAll() {
    return this.cache.remember('products.all', 300, () => {
      return this.productsRepo.findAll();
    });
  }

  async findById(id: string) {
    return this.cache.remember(`products.${id}`, 300, () => {
      return this.productsRepo.findById(id);
    });
  }
}
```

### Manual Invalidation

```typescript
@Injectable()
export class ProductsService {
  constructor(
    private productsRepo: ProductsRepository,
    private cache: CacheService
  ) {}

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productsRepo.update(id, dto);

    // Invalidate stale entries
    await this.cache.forget(`products.${id}`);
    await this.cache.forget('products.all');

    return product;
  }

  async clearAll() {
    await this.cache.flush();
  }
}
```

## The `@Cacheable()` Decorator

`@Cacheable()` wraps a method so its return value is cached automatically:

```typescript
import { Cacheable } from '@nyalajs/cache';

@Cacheable('users.all', 300)
async findAll() { /* ... */ }
```

Its signature:

```typescript
function Cacheable(key?: string, ttl?: number): MethodDecorator;
```

- **`key`** *(optional)* — the cache key. If omitted, it defaults to `ClassName.methodName`.
- **`ttl`** *(optional)* — TTL in seconds for this specific method. Falls back to `CacheService`'s configured default TTL if omitted.

`@Cacheable()` resolves the cache client from `this.__cacheService` on the class instance — so the instance needs that property assigned to a `CacheService` for the decorator to actually cache anything. The straightforward way is to assign it from the constructor-injected `CacheService`:

```typescript
import { Injectable } from '@nyalajs/core';
import { CacheService, Cacheable, CacheEvict } from '@nyalajs/cache';

@Injectable()
export class ProductsService {
  // @Cacheable()/@CacheEvict() read the cache client off this property.
  private readonly __cacheService: CacheService;

  constructor(private productsRepo: ProductsRepository, cacheService: CacheService) {
    this.__cacheService = cacheService;
  }

  @Cacheable('products.all', 300)
  async findAll() {
    return this.productsRepo.findAll();
  }

  @Cacheable(undefined, 300) // Key defaults to "ProductsService.findById"
  async findById(id: string) {
    return this.productsRepo.findById(id);
  }
}
```

If `__cacheService` isn't set, the decorated method just runs normally without caching — it fails open rather than throwing, which is convenient in unit tests where you construct the service directly without wiring up caching.

## The `@CacheEvict()` Decorator

`@CacheEvict()` deletes a cache key after the decorated method resolves — use it on writes that should invalidate a previously cached read:

```typescript
function CacheEvict(key: string): MethodDecorator;
```

```typescript
@Injectable()
export class ProductsService {
  private readonly __cacheService: CacheService;

  constructor(private productsRepo: ProductsRepository, cacheService: CacheService) {
    this.__cacheService = cacheService;
  }

  @Cacheable('products.all', 300)
  async findAll() {
    return this.productsRepo.findAll();
  }

  @CacheEvict('products.all')
  async create(dto: CreateProductDto) {
    return this.productsRepo.create(dto);
  }
}
```

Unlike `@Cacheable()`, `@CacheEvict()` takes a required `key` — there's no "derive from class/method name" fallback, since eviction needs to target the exact key that was written by the corresponding read.

## TTL and Expiration

TTL can be set at three levels, in order of precedence from most to least specific:

1. Per-call, as the `ttl` argument to `cache.set()` or `cache.remember()`.
2. Per-method, as the second argument to `@Cacheable()`.
3. Globally, via `defaultTtl` passed to `cache.connect()` (defaults to `3600` seconds if never configured).

```typescript
// Per-call TTL
await this.cache.set('report:daily', report, 86400); // 24 hours

// Per-method TTL
@Cacheable('report.daily', 86400)
async getDailyReport() { /* ... */ }

// Global default (used when no TTL is given anywhere above)
await cache.connect({ defaultTtl: 3600 });
```

## In-Memory vs. Redis

The in-memory store (`InMemoryStore`) is a simple expiring `Map` — it works identically to the Redis-backed client from the caller's perspective (`get`/`set`/`del`/`flushall`), but state isn't shared across processes and is lost on restart. Use it for local development and tests; use Redis (by passing `url` to `connect()`) for anything running more than one process or instance:

```typescript
// Development: no config needed, uses in-memory store automatically
const cache = new CacheService();
await cache.set('key', 'value');

// Production: connect to a shared Redis instance
await cache.connect({ url: process.env.REDIS_URL, defaultTtl: 3600 });
```

## Testing with `CacheService`

Because `CacheService` uses an in-memory store by default, tests don't need to mock Redis at all — just instantiate it directly and, if reusing the same instance across tests, call `flush()` in between to avoid cross-test pollution:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CacheService } from '@nyalajs/cache';

describe('ProductsService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService(); // In-memory store, no Redis needed
  });

  it('caches the result of findAll()', async () => {
    const productsRepo = { findAll: async () => [{ id: '1' }] };
    const service = new ProductsService(productsRepo as any, cache);

    const first = await service.findAll();
    const second = await service.findAll();

    expect(first).toEqual(second);
  });
});
```

## Best Practices

### 1. Cache Reads, Invalidate on Writes

```typescript
// ✅ Good: cached read, explicit invalidation on write
@Cacheable('products.all', 300)
async findAll() { /* ... */ }

@CacheEvict('products.all')
async create(dto: CreateProductDto) { /* ... */ }

// ❌ Bad: cached data goes stale after writes with no eviction
@Cacheable('products.all', 300)
async findAll() { /* ... */ }

async create(dto: CreateProductDto) {
  return this.productsRepo.create(dto); // "products.all" cache never invalidated
}
```

### 2. Use Specific, Predictable Keys

```typescript
// ✅ Good: namespaced, includes the identifier
await this.cache.set(`user:${userId}:profile`, profile, 600);

// ❌ Bad: generic key, likely to collide across resources
await this.cache.set('data', profile, 600);
```

### 3. Keep TTLs Proportional to Data Volatility

```typescript
// ✅ Good: short TTL for frequently changing data
await this.cache.set('stock:price', price, 10);

// ✅ Good: longer TTL for rarely changing data
await this.cache.set('config:features', features, 3600);

// ❌ Bad: same long TTL for everything regardless of volatility
await this.cache.set('stock:price', price, 3600);
```

### 4. Don't Cache User-Specific Data Under Shared Keys

```typescript
// ✅ Good: key includes the user
await this.cache.set(`cart:${userId}`, cart, 1800);

// ❌ Bad: every user's cart overwrites the same key
await this.cache.set('cart', cart, 1800);
```

### 5. Prefer `remember()` Over Manual Get/Set Pairs

```typescript
// ✅ Good: one call, no risk of forgetting to store the result
async findAll() {
  return this.cache.remember('products.all', 300, () => this.productsRepo.findAll());
}

// ❌ Bad: easy to forget the `set()` call on one code path
async findAll() {
  const cached = await this.cache.get('products.all');
  if (cached) return cached;
  return this.productsRepo.findAll(); // forgot to cache.set() here
}
```

## Next Steps

- [Error Handling](./error-handling) - Error management
- [Services](../building-blocks/services) - Service layer patterns
