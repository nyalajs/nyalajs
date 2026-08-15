# Security

Security utilities API reference, from `@nyalajs/security` and `@nyalajs/http`. For guard usage patterns and full examples, see [Authentication](../features/authentication) and [Authorization](../features/authorization).

## `JwtStrategy`

Signs and verifies JWTs — not a service you call `.verify()`/`.generateToken()` on; the real methods are `sign()` and `authenticate()`:

```typescript
import { Injectable } from '@nyalajs/core';
import { JwtStrategy } from '@nyalajs/security';

@Injectable()
export class AuthService {
  constructor(private jwtStrategy: JwtStrategy) {}

  generateToken(userId: string) {
    return this.jwtStrategy.sign({ sub: userId });
  }

  async verifyToken(token: string) {
    // Returns UserIdentity | null — never throws for an invalid/expired token.
    return this.jwtStrategy.authenticate(token);
  }
}
```

`JwtStrategy` itself is constructed with `{ secret, expiresIn?, issuer?, audience? }` — see [Authentication](../features/authentication) for how it's registered as a provider (typically via a `useFactory` reading `JWT_SECRET` from config).

## `HashingService`

Bcrypt-backed password hashing:

```typescript
import { Injectable } from '@nyalajs/core';
import { HashingService } from '@nyalajs/security';

@Injectable()
export class AuthService {
  constructor(private hashing: HashingService) {}

  async hashPassword(plain: string) {
    return this.hashing.hash(plain);
  }

  async checkPassword(plain: string, hashed: string) {
    return this.hashing.compare(plain, hashed);
  }
}
```

## Guards: `AuthGuard`, `RolesGuard`, `PolicyGuard`

All three implement the real `Guard` interface (`@nyalajs/http`) — `canActivate(context: ExecutionContext): boolean | Promise<boolean>`, reading `context.request` directly (there's no `context.switchToHttp()`, that's a different framework's API):

```typescript
import { Controller, Get, Delete, UseGuards } from '@nyalajs/core';
import { AuthGuard, RolesGuard, Roles } from '@nyalajs/security';

@Controller('/admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  @Get('/users')
  @Roles('admin')
  async listUsers() {}

  @Delete('/users/:id')
  @Roles('admin', 'moderator')
  async deleteUser(@Param('id') id: string) {}
}
```

Every class passed to `@UseGuards()` must also be registered in the module's `providers` array — see [Authorization](../features/authorization) for why, and the `nyala doctor` check (`guard-providers-registered`) that catches it if you forget.

### Writing a Custom Guard

```typescript
import { Injectable } from '@nyalajs/core';
import { Guard, ExecutionContext } from '@nyalajs/http';

@Injectable()
export class OwnershipGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.context.metadata.get('user');
    const resourceId = context.request.params.id;

    const resource = await this.getResource(resourceId);
    return resource.ownerId === user?.userId;
  }

  private async getResource(id: string) { /* ... */ }
}
```

## CSRF, Helmet, CORS, Rate Limiting

These are not middleware you import and call `app.use()` on — they're built into `FastifyAdapter` and enabled by default, configured via options passed to it in `bootstrap/main.ts`:

```typescript
const httpAdapter = new FastifyAdapter(app.getKernel().getContainer(), {
  helmet: true,        // default: true — sets security headers via @fastify/helmet
  csrf: true,           // default: true — @fastify/csrf-protection, paired with sessions
  cors: true,
  corsOrigin: ['https://example.com'],
  rateLimit: true,      // default: true — @fastify/rate-limit, Redis-backed when REDIS_URL is set
  session: true,         // required for csrf to have something to bind tokens to
});
```

There's no separate `@nyalajs/throttler` package or `@Throttle()` decorator — rate limiting is global (per-IP, via `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` env vars), not configured per-route. See [`FastifyAdapterOptions`](./http) for the complete option list, including CSP directive customization.

## SQL Injection Prevention

Always use parameterized queries — Drizzle's query builder does this by default:

```typescript
// ✅ Good: parameterized
const user = await db.select().from(users).where(eq(users.email, email));

// ❌ Bad: string concatenation, even via sql`` — never interpolate directly
const user = await db.execute(sql`SELECT * FROM users WHERE email = '${email}'`);
```

## Input Validation

```typescript
import { z } from 'zod';
import { Post, Body } from '@nyalajs/core';
import { UseValidation } from '@nyalajs/validation';

const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
});

@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {}
```

## Secrets

There is no `@nyalajs/secrets`/`SecretService` package — secrets are read from environment variables via `ConfigService` (`@nyalajs/config`), loaded from `.env` files. See [Configuration](../configuration) for the real mechanism; there's currently no built-in integration with an external secrets manager (Vault, AWS Secrets Manager, etc.) beyond `.env`.

## Encryption

There is no `@nyalajs/crypto` package with `encrypt()`/`decrypt()` helpers. For encryption needs beyond password hashing (which `HashingService` covers), use Node's built-in `crypto` module directly.

## Best Practices

1. **Never store plain passwords** — always hash with `HashingService`
2. **Use HTTPS in production**
3. **Validate all inputs** with `@UseValidation()`
4. **Use parameterized queries** (Drizzle does this by default — never hand-interpolate into `sql\`\``)
5. **Keep `helmet`/`csrf`/`rateLimit` enabled** in `FastifyAdapterOptions` (all default to `true`)
6. **Keep dependencies updated**
7. **Register every guard/interceptor/filter class as a provider** — see [Authorization](../features/authorization)
8. **Use audit logging** (`@nyalajs/audit`) for security-relevant events
9. **Regular security audits** of dependencies

## Next Steps

- [Authentication](../features/authentication) - Auth implementation
- [Authorization](../features/authorization) - Access control
- [Validation](../features/validation) - Input validation
- [HTTP](./http) - `FastifyAdapterOptions` reference
