# Authorization

Nyala provides two complementary authorization models: role-based access control (RBAC) with `@Roles()` and `RolesGuard`, and policy-based access control (ABAC-style) with `Policy` classes and `PolicyGuard`. Both compose with the `AuthGuard` from [Authentication](./authentication), which is responsible for populating the current user before any authorization guard runs.

## Quick Start

Protect a controller with authentication, then layer role checks on top:

```typescript
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nyalajs/core';
import { AuthGuard, RolesGuard, Roles } from '@nyalajs/security';

@Controller('/users')
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  @Roles('admin', 'superadmin')
  async findAll(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    return this.usersService.findAll({ page, limit });
  }

  @Get('/:id')
  async findOne(@Param('id') id: string) {
    // No @Roles() here — any authenticated user can view a single user
    return this.usersService.findOne(id);
  }

  @Delete('/:id')
  @Roles('admin', 'superadmin')
  async delete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
```

`AuthGuard` runs first and attaches the authenticated identity to the request context. `RolesGuard` then reads that identity and checks it against the roles declared with `@Roles()` on the handler being called.

## Role-Based Access Control

### The `@Roles()` Decorator

`@Roles()` is a method decorator that attaches one or more required role names to a route handler:

```typescript
import { Roles } from '@nyalajs/security';

@Post('/')
@Roles('admin', 'superadmin')
async create(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}
```

A user only needs **one** of the listed roles to pass — `RolesGuard` checks with `.some()`, not `.every()`. Handlers with no `@Roles()` at all are allowed through unconditionally by `RolesGuard` (the role check is opt-in per route).

### `RolesGuard`

`RolesGuard` implements `Guard` from `@nyalajs/http`. On each request it:

1. Looks up the `@Roles()` metadata for the controller and handler being invoked.
2. If no roles are declared, allows the request through.
3. Otherwise, reads the `user` object from `context.context.metadata` (the same map `AuthGuard` populates) and throws `ForbiddenException` if the user has no `roles` array, or none of it matches the required roles.

```typescript
import { Injectable } from '@nyalajs/core';
import { Guard, ExecutionContext, ForbiddenException } from '@nyalajs/http';
import { getRolesMetadata } from './roles.decorator';

@Injectable()
export class RolesGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = getRolesMetadata(context.route.controller, context.route.handlerName);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required
    }

    const user = context.context.metadata.get('user');

    if (!user || !user.roles) {
      throw new ForbiddenException('User roles not found');
    }

    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
```

This means `RolesGuard` expects **something** upstream — usually `AuthGuard` — to have already called `context.context.metadata.set('user', identity)` with an object that has a `roles: string[]` property. `RolesGuard` does not authenticate anything itself; it only authorizes based on whatever user object is already on the context.

### Composing with `AuthGuard`

Register guards in the order they should run. `AuthGuard` must come before `RolesGuard`:

```typescript
@Controller('/admin/users')
@UseGuards(AuthGuard, RolesGuard)
export class AdminUsersController {
  @Get('/')
  @Roles('admin')
  async index() {
    return this.usersService.findAll();
  }
}
```

If your app uses a custom session-based guard instead of the JWT `AuthGuard`, it works the same way as long as it populates `context.context.metadata` with a `user` object that has a `roles` array:

```typescript
import { Injectable } from '@nyalajs/core';
import { Guard, ExecutionContext } from '@nyalajs/http';

@Injectable()
export class SessionAuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    const userId = context.request.session?.get('userId');
    const role = context.request.session?.get('role');

    if (!userId) return false;

    context.context.userId = userId;
    context.context.metadata.set('user', { userId, roles: role ? [role] : [] });
    return true;
  }
}

// Usage: RolesGuard works with any guard that populates "user" this way
@Controller('/admin/users')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AdminUsersController {
  @Get('/')
  @Roles('admin')
  async index() { /* ... */ }
}
```

## Policy-Based Authorization

For authorization decisions that depend on the specific resource being accessed — "can this user edit *this* post" rather than "does this user have the editor role" — use `Policy` classes with `@UsePolicy()` and `PolicyGuard`.

### Defining a Policy

Subclass the abstract `Policy` base class from `@nyalajs/security` and implement the actions your resource supports:

```typescript
import { Policy } from '@nyalajs/security';
import { Post } from '../models/post.model';
import { UserIdentity } from '../types';

export class PostPolicy extends Policy {
  update(user: UserIdentity, post: Post): boolean {
    return post.authorId === user.userId;
  }

  delete(user: UserIdentity, post: Post): boolean {
    return post.authorId === user.userId || user.roles?.includes('admin');
  }
}
```

`Policy` declares optional stubs for the four common CRUD actions plus a catch-all:

```typescript
export abstract class Policy {
  before?(user: any, resource?: any): boolean | undefined;

  view?(user: any, resource?: any): boolean | Promise<boolean>;
  create?(user: any, resource?: any): boolean | Promise<boolean>;
  update?(user: any, resource?: any): boolean | Promise<boolean>;
  delete?(user: any, resource?: any): boolean | Promise<boolean>;

  handle?(action: string, user: any, resource?: any): boolean | Promise<boolean>;
}
```

You only need to implement the actions your policy actually uses — leave the rest undefined.

### The `before()` Hook

Implement `before()` to short-circuit every action check for a policy — useful for a global "admins can do anything" rule:

```typescript
export class PostPolicy extends Policy {
  before(user: UserIdentity): boolean | undefined {
    if (user.roles?.includes('admin')) return true; // Admins bypass all checks
    return undefined; // Otherwise, fall through to the specific action method
  }

  update(user: UserIdentity, post: Post): boolean {
    return post.authorId === user.userId;
  }
}
```

Return `true` to allow unconditionally, `false` to deny unconditionally, or `undefined` to fall through to the action-specific method.

### `@UsePolicy()`

Attach a policy to a controller class or an individual route handler:

```typescript
import { UsePolicy } from '@nyalajs/security';
import { PostPolicy } from '../policies/post.policy';

@Controller('/posts')
@UseGuards(AuthGuard, PolicyGuard)
export class PostsController {
  @Put('/:id')
  @UsePolicy(PostPolicy, 'update', 0)
  async update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, dto);
  }
}
```

`UsePolicy(PolicyClass, action?, resourceArg?)` takes three arguments:

- **`PolicyClass`** — the policy to evaluate. `PolicyGuard` resolves it from the DI container if possible, falling back to a plain `new PolicyClass()` if it isn't registered as a provider.
- **`action`** *(optional)* — which method on the policy to call. If omitted, it's derived from the HTTP verb: `GET` → `view`, `POST` → `create`, `PUT`/`PATCH` → `update`, `DELETE` → `delete`, anything else → `handle`.
- **`resourceArg`** *(optional)* — the index of the handler argument that holds the resource being checked, used by `PolicyGuard` to pass the right value as the policy's `resource` parameter.

### `PolicyGuard`

`PolicyGuard` looks up the `@UsePolicy()` metadata for the current route (checking the handler first, then falling back to the controller class), resolves the policy, runs `before()` if present, then calls the resolved action method:

```typescript
@Injectable()
export class PolicyGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta =
      getPolicyMetadata(context.route.controller, context.route.handlerName) ??
      getPolicyMetadata(context.route.controller);

    if (!meta) return true; // No policy declared → allow

    const { PolicyClass, action, resourceArg } = meta;
    const policy = context.container.resolve(PolicyClass);
    const user = context.context.metadata.get('user');
    const resource = resourceArg !== undefined ? context.request.args?.[resourceArg] : undefined;

    if (typeof policy.before === 'function') {
      const result = policy.before(user, resource);
      if (result === true) return true;
      if (result === false) throw new ForbiddenException('Policy denied access');
    }

    const actionName = action ?? defaultActionForMethod(context.route.method);
    const actionFn = policy[actionName];

    if (typeof actionFn !== 'function') {
      throw new ForbiddenException(`Policy "${PolicyClass.name}" has no action "${actionName}"`);
    }

    const allowed = await actionFn.call(policy, user, resource);
    if (!allowed) throw new ForbiddenException('Policy denied access');

    return true;
  }
}
```

Like `RolesGuard`, `PolicyGuard` relies on `context.context.metadata.get('user')` already being populated — register it after `AuthGuard` (or another guard that sets `user`).

### Class-Level Policies

`@UsePolicy()` also works as a class decorator, applying the same policy and action to every route on the controller unless overridden per-handler:

```typescript
@Controller('/posts')
@UseGuards(AuthGuard, PolicyGuard)
@UsePolicy(PostPolicy)
export class PostsController {
  @Get('/:id')
  async show(@Param('id') id: string) {
    // Uses the default action for GET → "view"
    return this.postsService.findById(id);
  }
}
```

### Custom Actions

Actions aren't limited to the four CRUD stubs. Use `handle()` as a catch-all for domain-specific actions, and pass the action name explicitly to `@UsePolicy()`:

```typescript
export class PostPolicy extends Policy {
  handle(action: string, user: UserIdentity, post: Post): boolean {
    if (action === 'publish') {
      return user.roles?.includes('editor') ?? false;
    }
    return false;
  }
}

@Post('/:id/publish')
@UsePolicy(PostPolicy, 'publish', 0)
async publish(@Param('id') id: string) {
  return this.postsService.publish(id);
}
```

## Combining Roles and Policies

Role checks and policy checks can run side by side — for example, requiring an `editor` role for write access to the resource type in general, while still enforcing per-resource ownership through a policy:

```typescript
@Controller('/posts')
@UseGuards(AuthGuard, RolesGuard, PolicyGuard)
export class PostsController {
  @Put('/:id')
  @Roles('editor', 'admin')
  @UsePolicy(PostPolicy, 'update', 0)
  async update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, dto);
  }
}
```

Guards run in the order passed to `@UseGuards()`, so `AuthGuard` populates the user, `RolesGuard` checks the coarse-grained role, and `PolicyGuard` checks the fine-grained, resource-specific rule.

## Error Responses

Both guards throw `ForbiddenException` (HTTP 403) on failure, following the same error format described in [Error Handling](./error-handling):

```json
{
  "statusCode": 403,
  "message": "User does not have required roles: admin, superadmin",
  "error": "Forbidden",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/users"
}
```

```json
{
  "statusCode": 403,
  "message": "Policy denied access",
  "error": "Forbidden",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/posts/123"
}
```

## Best Practices

### 1. Always Pair Authorization Guards with an Auth Guard

```typescript
// ✅ Good: user is guaranteed to be populated
@UseGuards(AuthGuard, RolesGuard)

// ❌ Bad: RolesGuard throws "User roles not found" for every request
@UseGuards(RolesGuard)
```

### 2. Prefer Roles for Coarse Checks, Policies for Ownership

```typescript
// ✅ Good: role gates the feature, policy checks ownership
@Roles('editor')
@UsePolicy(PostPolicy, 'update', 0)
async update() { /* ... */ }

// ❌ Bad: hand-rolled ownership check duplicating what a Policy already does
async update(@Param('id') id: string, @CurrentUser() user: User) {
  const post = await this.postsService.findById(id);
  if (post.authorId !== user.id) throw new ForbiddenException();
  // ...
}
```

### 3. Use `before()` for Global Overrides, Not Per-Action Duplication

```typescript
// ✅ Good: one bypass rule for admins
before(user: UserIdentity) {
  if (user.roles?.includes('admin')) return true;
  return undefined;
}

// ❌ Bad: repeating the same admin check in every action
update(user: UserIdentity, post: Post) {
  if (user.roles?.includes('admin')) return true;
  return post.authorId === user.userId;
}
```

### 4. Keep Policies Free of Side Effects

```typescript
// ✅ Good: pure boolean check
update(user: UserIdentity, post: Post): boolean {
  return post.authorId === user.userId;
}

// ❌ Bad: policies shouldn't mutate data or call external services
update(user: UserIdentity, post: Post): boolean {
  this.auditLog.record(user.userId, 'attempted-update'); // side effect
  return post.authorId === user.userId;
}
```

### 5. Register Policies as Providers When They Have Dependencies

```typescript
// ✅ Good: PolicyGuard resolves it from DI, constructor injection works
@Injectable()
export class PostPolicy extends Policy {
  constructor(private organizationsService: OrganizationsService) {
    super();
  }

  update(user: UserIdentity, post: Post): boolean {
    return post.authorId === user.userId;
  }
}

// Register in the module's providers array
@Module({ providers: [PostPolicy] })
export class PostsModule {}
```

## Next Steps

- [Authentication](./authentication) - JWT authentication and guards
- [Error Handling](./error-handling) - Error management
- [Middleware](../building-blocks/middleware) - Route protection
