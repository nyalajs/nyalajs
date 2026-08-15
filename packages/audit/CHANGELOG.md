# @nyalajs/audit

## 1.0.1

### Patch Changes

- Two real bugs found and fixed while assessing enterprise-readiness.

  - **`@nyalajs/audit`**: `DatabaseAuditAdapter.query()`'s filter conditions were built but never applied (the `.where()` call was commented out) — every query returned the entire audit log table regardless of criteria. Now genuinely filters via a real Drizzle `and(eq(...), ...)` clause, built from a new typed `AuditQueryCriteria` (`action`/`resourceType`/`resourceId`/`tenantId`/`actorId`/`from`/`to`/`limit`).
  - **`@nyalajs/scheduler`**: `@Scheduled()` jobs ran via plain in-process `node-cron` with no cross-process coordination — scaling an app to more than one replica caused every scheduled job to fire once per replica, every tick. New `SchedulerService.connect({redisUrl})` (mirroring `QueueService.connect()`'s shape) enables a Redis-backed distributed lock (`ioredis`, optional peer dependency) so only one replica runs a given tick; `@Scheduled()` gained an optional `lockTtlMs` for jobs that need to hold their lock longer than the 60s default. With no `redisUrl` configured, behavior is unchanged from before — every job just runs, correct only for a single running instance.
