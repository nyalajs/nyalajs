import { Injectable } from "@nyalajs/core";
import { CacheService } from "@nyalajs/cache";
import { Subject } from "./subject";

/**
 * Caches a subject's resolved effective permission names (direct + via
 * roles) so a permission check on a hot path doesn't hit the database on
 * every request — mirrors Spatie's own cache-by-default behavior (their
 * PermissionRegistrar caches the full role/permission map for up to 24h by
 * default). Wraps @nyalajs/cache's CacheService, which already degrades to
 * an in-memory store with no Redis configured — so this is ALWAYS on,
 * never a no-op, matching Spatie's own default rather than requiring the
 * app to opt in.
 *
 * Invalidation is coarse (flush the whole cache, or everything for one
 * subject) rather than fine-grained per-permission-name — correctness over
 * a marginal perf win, and it mirrors Spatie's own
 * `PermissionRegistrar::forgetCachedPermissions()` (full-cache-clear)
 * default, though flushFor() below is finer than Spatie actually offers.
 */
@Injectable()
export class PermissionCache {
    /** Default TTL: 10 minutes. Shorter than Spatie's 24h default deliberately — this framework's cache has no built-in cross-process invalidation signal, so a shorter TTL bounds how stale a permission check can get after an admin revokes access elsewhere, without requiring every write path to remember to call flush(). Writes still call flush()/flushFor() immediately, so this TTL is a safety net for staleness introduced OUTSIDE this package (e.g. someone deletes a row with raw SQL), not the primary invalidation mechanism. */
    private static readonly TTL_SECONDS = 600;

    /** Bumped on every flush() — folded into cache keys so a flush() invalidates every previously-cached entry instantly without needing to enumerate or delete them (the in-memory/Redis store still holds the old entries until their TTL expires, but nothing will ever read them again). */
    private generation = 0;

    constructor(private readonly cache: CacheService) {}

    private key(subject: Subject): string {
        return `nyala:permissions:v${this.generation}:${subject.modelType}:${subject.modelId}:${subject.guardName ?? "api"}:${subject.tenantId ?? "-"}`;
    }

    async remember(subject: Subject, factory: () => Promise<string[]>): Promise<string[]> {
        return this.cache.remember(this.key(subject), PermissionCache.TTL_SECONDS, factory);
    }

    /** Invalidates every cached permission set for every subject. Called on any Role/Permission definition change (a role's permissions changed, a permission was deleted) since that can affect subjects beyond just one. */
    flush(): void {
        this.generation++;
    }

    /** Invalidates the cached permission set for one subject only. Called on assignRole/removeRole/givePermissionTo/revokePermissionTo for that subject — cheaper than a full flush() when the blast radius is known to be one subject. */
    flushFor(subject: Subject): void {
        // No per-subject generation counter (would need one per subject,
        // unbounded growth) — a targeted flush just forces a fresh factory()
        // call by deleting this one key outright rather than bumping a
        // shared generation.
        void this.cache.forget(this.key(subject));
    }
}
