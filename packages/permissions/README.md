# @nyalajs/permissions

Database-backed role & permission management for Nyala.js — [Spatie laravel-permission](https://spatie.be/docs/laravel-permission) parity, and beyond: roles, direct permission grants, teams (multi-tenant role scoping), **wildcard permissions**, always-on caching, a super-admin bypass, and guards that check live instead of trusting a JWT's claims until the next login.

## Why not just `@Roles()`/`RolesGuard`?

`@nyalajs/security`'s `@Roles()`/`RolesGuard` check role names baked into the JWT at login — revoke a role, and it's still valid until the token expires or the user logs in again. This package is fully database-backed: `DBRolesGuard` reads the same `@Roles()` decorator but checks the database on every request, so a revoked role stops working on the very next call.

## Quick start

```ts
import { Injectable } from "@nyalajs/core";
import { PermissionManager } from "@nyalajs/permissions";

@Injectable()
class UsersService {
  constructor(private permissions: PermissionManager) {}

  async promote(user: User) {
    await this.permissions.assignRole(user, "editor");
  }

  async canPublish(user: User) {
    return this.permissions.can(user, "posts.publish");
  }
}
```

Wire it into a module:

```ts
import { Module } from "@nyalajs/core";
import { permissionsProviders } from "@nyalajs/permissions";

@Module({
  providers: [
    ...permissionsProviders({ superAdminRoles: ["super-admin"] }),
    UsersService,
  ],
})
export class AppModule {}
```

(This framework's `@Module()` only accepts `imports: Type[]` — concrete module classes, not a NestJS-style dynamic module object — so `permissionsProviders()` is a plain function returning the provider list, not a `.forRoot()` you import.)

## Migration

Copy `node_modules/@nyalajs/permissions/migrations/create_permissions_tables.ts` into your app's `database/migrations/` (renumbered to fit your sequence) and run `nyala db:migrate`. Written for Postgres, matching the `nyala db:migrate` CLI (currently Postgres-only).

## Guards

```ts
import { UseGuards } from "@nyalajs/core";
import { AuthGuard } from "@nyalajs/security";
import { Permissions, PermissionsGuard, DBRolesGuard, RoleOrPermission, RoleOrPermissionGuard } from "@nyalajs/permissions";

@UseGuards(AuthGuard, PermissionsGuard)
@Permissions("posts.delete")
@Delete(":id")
remove() { ... }

// Drop-in replacement for @nyalajs/security's RolesGuard — same @Roles() decorator, DB-backed instead of JWT-claims-backed.
@UseGuards(AuthGuard, DBRolesGuard)
@Roles("admin")
@Get("admin-only")
adminOnly() { ... }

// Passes on either a matching ROLE or a matching PERMISSION.
@UseGuards(AuthGuard, RoleOrPermissionGuard)
@RoleOrPermission("editor", "posts.edit")
@Put(":id")
update() { ... }
```

`AuthGuard` must run first — every guard here reads `context.context.metadata.get("user")`, which `AuthGuard` populates.

## API (Spatie parity)

`PermissionManager` — the single entry point most code should use (TypeScript has no traits, so this is a companion service standing in for Spatie's `HasRoles`/`HasPermissions` Eloquent traits):

| Method | |
|---|---|
| `assignRole` / `removeRole` / `syncRoles` | |
| `hasRole` / `hasAnyRole` / `hasAllRoles` / `hasExactRoles` | |
| `getRoleNames` | |
| `givePermissionTo` / `revokePermissionTo` / `syncPermissions` | direct grants, bypassing roles |
| `can` (alias for `hasPermissionTo`) / `hasAnyPermission` / `hasAllPermissions` | direct + via-role, wildcard-aware |
| `hasDirectPermission` / `hasAnyDirectPermission` / `hasAllDirectPermissions` | direct grants only |
| `hasPermissionViaRole` | role-derived only |
| `getDirectPermissionNames` / `getPermissionNamesViaRoles` / `getAllPermissions` | |

Every method takes `(model: {id}, name, options?, modelType = "User")` — works on any model, not just `User` (Spatie's polymorphic `model_has_roles`/`model_has_permissions`).

## Wildcard permissions (Spatie doesn't have this by default)

```ts
await permissions.givePermissionTo(user, "posts.*");
await permissions.can(user, "posts.create"); // true
await permissions.can(user, "posts.delete"); // true
await permissions.can(user, "comments.delete"); // false
```

Trailing-wildcard matching only (`posts.*`, not `posts.*.delete`) — predictable semantics over glob completeness, since this runs on every permission check.

## Teams (multi-tenant role scoping)

```ts
await permissions.assignRole(user, "admin", { tenantId: acmeCorpId });
await permissions.hasRole(user, "admin", { tenantId: acmeCorpId }); // true
await permissions.hasRole(user, "admin", { tenantId: otherCorpId }); // false
await permissions.hasRole(user, "admin"); // false — global scope is distinct from any team
```

Pass your app's real tenant id directly — no translation needed. (Internally this is stored in a `teamId` column, not `tenantId`: `@nyalajs/database` auto-scopes any table with a column literally named `tenantId`, throwing without an active `TenantContext` — wrong here, since global and team-scoped roles must coexist in the same table. `RoleService`/`PermissionService` apply team filtering explicitly instead.)

## Super-admin bypass

```ts
providers: [...permissionsProviders({ superAdminRoles: ["super-admin"] })]
```

Mirrors Laravel's `Gate::before()` convention — a subject with this role skips every permission/role check unconditionally, checked against the DB-backed role list (not JWT claims), so it can be revoked immediately too.

## Caching

Every `getAllPermissionNames()` resolution (the thing every `can()`/`hasPermissionTo()` call ultimately checks) is cached via `@nyalajs/cache`'s `CacheService` — always on, degrading to an in-memory store if Redis isn't configured, never a no-op. Any write (`assignRole`, `givePermissionTo`, a role's permissions changing, etc.) invalidates the relevant cache entry immediately, so there's no manual `forgetCachedPermissions()` step to remember.

## What's NOT Included

- **No Blade-directive equivalent** — this is a backend permission layer; gate your own frontend/template rendering on `PermissionManager.can()` results passed down as booleans.
- **No Artisan-equivalent CLI commands yet** (`permission:create-role`, `permission:show`, etc.) — use `PermissionManager`/`RoleService`/`PermissionService` directly, or a seeder script.
- **No event system** (Spatie's `RoleAttachedEvent` etc.) — hook into your own call sites if you need side effects on role/permission changes.
