# Permissions

`@nyalajs/permissions` adds database-backed role & permission management — [Spatie laravel-permission](https://spatie.be/docs/laravel-permission) parity, and beyond: roles, direct permission grants, teams (multi-tenant role scoping), wildcard permissions, always-on caching, and a super-admin bypass.

This is a separate, larger layer on top of the [Authorization](./authorization) page's `@Roles()`/`RolesGuard`/`Policy` system, not a replacement — read that page first if you haven't. The short version of why both exist: `@Roles()`/`RolesGuard` check role names baked into a JWT at login time (stale until the token is re-issued); `@nyalajs/permissions` checks a real database on every request, so revoking a role or permission takes effect immediately.

## Quick start

```typescript
import { Injectable } from '@nyalajs/core';
import { PermissionManager } from '@nyalajs/permissions';

@Injectable()
class UsersService {
  constructor(private permissions: PermissionManager) {}

  async promote(user: User) {
    await this.permissions.assignRole(user, 'editor');
  }

  async canPublish(user: User) {
    return this.permissions.can(user, 'posts.publish');
  }
}
```

Wire the package's providers into your module:

```typescript
import { Module } from '@nyalajs/core';
import { permissionsProviders } from '@nyalajs/permissions';

@Module({
  providers: [
    ...permissionsProviders({ superAdminRoles: ['super-admin'] }),
    UsersService,
  ],
})
export class AppModule {}
```

`@Module()` in this framework only accepts `imports: Type[]` — concrete module classes, not a NestJS-style dynamic module object — so `permissionsProviders()` is a plain function you spread into your own `providers` array, not a `.forRoot()` you import.

## Migration

Copy `node_modules/@nyalajs/permissions/migrations/create_permissions_tables.ts` into your app's `database/migrations/` (renumbered to fit your own sequence) and run `nyala db:migrate`. It creates five tables — `roles`, `permissions`, `role_has_permissions`, `model_has_roles`, `model_has_permissions` — mirroring Spatie's schema. Written for Postgres, matching the `nyala db:migrate` CLI (currently Postgres-only).

## Guards

```typescript
import { UseGuards } from '@nyalajs/core';
import { AuthGuard } from '@nyalajs/security';
import { Permissions, PermissionsGuard, DBRolesGuard, RoleOrPermission, RoleOrPermissionGuard } from '@nyalajs/permissions';

@UseGuards(AuthGuard, PermissionsGuard)
@Permissions('posts.delete')
@Delete(':id')
remove() { ... }
```

`DBRolesGuard` is a drop-in replacement for `@nyalajs/security`'s `RolesGuard` — it reads the exact same `@Roles()` decorator, just checks the database instead of the JWT:

```typescript
@UseGuards(AuthGuard, DBRolesGuard)  // swap RolesGuard for DBRolesGuard
@Roles('admin')                       // decorator itself is unchanged
@Get('admin-only')
adminOnly() { ... }
```

`RoleOrPermissionGuard` passes if the subject has *either* a matching role *or* a matching permission — mirrors Spatie's `role_or_permission` middleware:

```typescript
@UseGuards(AuthGuard, RoleOrPermissionGuard)
@RoleOrPermission('editor', 'posts.edit')
@Put(':id')
update() { ... }
```

`AuthGuard` must always run first — every guard here reads `context.context.metadata.get('user')`, which only `AuthGuard` populates. And as with any guard, register the guard class itself as a DI provider in the module — `@UseGuards()` only records which class to run; the container still has to resolve an instance of it (see the callout on the [Authorization](./authorization) page).

## API surface (Spatie parity)

`PermissionManager` is the single entry point most application code should use — a companion service standing in for Spatie's `HasRoles`/`HasPermissions` Eloquent traits (TypeScript classes can't mix in traits the way PHP does).

| Method | |
|---|---|
| `assignRole` / `removeRole` / `syncRoles` | |
| `hasRole` / `hasAnyRole` / `hasAllRoles` / `hasExactRoles` | |
| `getRoleNames` | |
| `givePermissionTo` / `revokePermissionTo` / `syncPermissions` | direct grants, bypassing roles entirely |
| `can` (alias for `hasPermissionTo`) / `hasAnyPermission` / `hasAllPermissions` | direct grants + role-derived, wildcard-aware |
| `hasDirectPermission` / `hasAnyDirectPermission` / `hasAllDirectPermissions` | direct grants only |
| `hasPermissionViaRole` | role-derived only |
| `getDirectPermissionNames` / `getPermissionNamesViaRoles` / `getAllPermissions` | |

Every method takes `(model: {id}, name, options?, modelType = 'User')` — works on any model, not just `User`, mirroring Spatie's polymorphic `model_has_roles`/`model_has_permissions` design (a role or permission can be assigned to an `ApiClient`, a `Team`, anything with an id).

## Wildcard permissions

A feature base Spatie laravel-permission does not ship by default:

```typescript
await permissions.givePermissionTo(user, 'posts.*');

await permissions.can(user, 'posts.create'); // true
await permissions.can(user, 'posts.delete'); // true
await permissions.can(user, 'comments.delete'); // false
```

Matching is trailing-wildcard only (`posts.*`, not `posts.*.delete`) — predictable, simple semantics over glob completeness, since this runs on every permission check.

## Teams (multi-tenant role scoping)

```typescript
await permissions.assignRole(user, 'admin', { tenantId: acmeCorpId });

await permissions.hasRole(user, 'admin', { tenantId: acmeCorpId }); // true
await permissions.hasRole(user, 'admin', { tenantId: otherCorpId }); // false
await permissions.hasRole(user, 'admin'); // false — global scope is distinct from any one team
```

Pass your app's real tenant id directly — no translation needed, and it works the same whether or not you're using `@nyalajs/tenancy` elsewhere.

Internally this is stored in a `teamId` column, not `tenantId`. That's deliberate: `@nyalajs/database`'s `Model` auto-scopes any table with a column literally named `tenantId`, throwing if no `TenantContext` is active for the current request — correct behavior for ordinary application data, but wrong here, since a *global* role (no team) and a *team-scoped* role need to coexist in the same table. `RoleService`/`PermissionService` apply team filtering explicitly in their own queries instead of relying on that automatic scoping.

## Super-admin bypass

```typescript
providers: [...permissionsProviders({ superAdminRoles: ['super-admin'] })]
```

Mirrors Laravel's `Gate::before()` convention: a subject holding this role skips every permission and role check unconditionally. Checked against the subject's live, database-backed role list — not JWT claims — so it can be revoked immediately too, same as every other check in this package.

## Caching

`getAllPermissionNames()` — what every `can()`/`hasPermissionTo()` call ultimately resolves and checks against — is cached via `@nyalajs/cache`'s `CacheService`. Always on (degrades to an in-memory store if Redis isn't configured, never a no-op), matching Spatie's own cache-by-default behavior. Every write — `assignRole`, `givePermissionTo`, a role's permission set changing, etc. — invalidates the relevant cache entry immediately; there's no manual `forgetCachedPermissions()` step to remember.

## What's NOT Included

- **No template-directive equivalent** (Spatie's `@role`/`@haspermission` Blade directives) — this is a backend permission layer; pass `PermissionManager.can()` results down as plain booleans to whatever templating/frontend layer you're using.
- **No Artisan-equivalent CLI commands yet** (`permission:create-role`, `permission:show`, `permission:cache-reset`) — use `PermissionManager`/`RoleService`/`PermissionService` directly, or write a seeder script for your app's initial roles/permissions.
- **No event system** (Spatie's `RoleAttachedEvent`/`PermissionAttachedEvent`/etc.) — add your own logic at the call site if you need side effects when a role or permission changes.

## Next Steps

- [Authorization](./authorization) - The JWT-claims-based `@Roles()`/`RolesGuard`/`Policy` system this package layers on top of
- [Authentication](./authentication) - `AuthGuard`/`JwtStrategy`, which every guard here depends on
- [Multi-Tenancy](../multi-tenancy/overview) - Tenant isolation for ordinary application data (distinct from this package's "teams" feature)
