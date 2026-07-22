# Security

Security utilities and best practices.

## Authentication

### JWT Service

```typescript
import { JwtService } from '@nyalajs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  generateToken(payload: any) {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });
  }

  verifyToken(token: string) {
    return this.jwtService.verify(token, {
      secret: process.env.JWT_SECRET,
    });
  }
}
```

### Password Hashing

```typescript
import { hash, compare } from '@nyalajs/crypto';

// Hash password
const hashedPassword = await hash('plain-password', 10);

// Compare password
const isValid = await compare('plain-password', hashedPassword);
```

## Authorization

### Role-Based Access Control

```typescript
import { Roles, RolesGuard } from '@nyalajs/auth';

@Controller('/admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  @Get('/users')
  @Roles('admin')
  async listUsers() {}

  @Delete('/users/:id')
  @Roles('admin', 'moderator')
  async deleteUser() {}
}
```

### Custom Guards

```typescript
import { CanActivate, ExecutionContext } from '@nyalajs/core';

@Injectable()
export class OwnershipGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const resourceId = request.params.id;

    const resource = await this.getResource(resourceId);
    return resource.ownerId === user.id;
  }
}
```

## CSRF Protection

```typescript
import { csrf } from '@nyalajs/security';

// Enable CSRF
app.use(csrf({
  cookie: true,
}));

// Get token in template
<input type="hidden" name="_csrf" value="<%= csrfToken %>" />
```

## XSS Protection

```typescript
import { helmet } from '@nyalajs/security';

// Enable security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
```

## SQL Injection Prevention

Always use parameterized queries:

```typescript
// ✅ Good: Parameterized query
const user = await db
  .select()
  .from(users)
  .where(eq(users.email, email));

// ❌ Bad: String concatenation
const user = await db.execute(
  sql`SELECT * FROM users WHERE email = '${email}'`
);
```

## Secrets Management

```typescript
import { SecretService } from '@nyalajs/secrets';

@Injectable()
export class ConfigService {
  constructor(private secrets: SecretService) {}

  async getDatabasePassword() {
    return this.secrets.get('DATABASE_PASSWORD');
  }
}
```

## Rate Limiting

```typescript
import { ThrottlerGuard } from '@nyalajs/throttler';

@Controller('/api')
@UseGuards(ThrottlerGuard)
export class ApiController {
  // Limited to 10 requests per minute
  @Get('/data')
  @Throttle(10, 60)
  async getData() {}
}
```

## Input Validation

Always validate user input:

```typescript
import { z } from 'zod';

const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
});

@Post('/')
@UseValidation(CreateUserValidator)
async create(@Body() dto: CreateUserDto) {}
```

## Encryption

```typescript
import { encrypt, decrypt } from '@nyalajs/crypto';

// Encrypt sensitive data
const encrypted = encrypt('sensitive-data', process.env.ENCRYPTION_KEY);

// Decrypt
const decrypted = decrypt(encrypted, process.env.ENCRYPTION_KEY);
```

## Security Headers

```typescript
// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
```

## Best Practices

1. **Never store plain passwords**
2. **Use HTTPS in production**
3. **Validate all inputs**
4. **Use parameterized queries**
5. **Implement rate limiting**
6. **Keep dependencies updated**
7. **Use security headers**
8. **Implement CSRF protection**
9. **Log security events**
10. **Regular security audits**

## Next Steps

- [Authentication](../features/authentication) - Auth implementation
- [Authorization](../features/authorization) - Access control
- [Validation](../features/validation) - Input validation
