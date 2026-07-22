# Security Best Practices

## Authentication

### JWT Configuration

```typescript
import { JwtStrategy } from "@nyala/security";

const jwtStrategy = new JwtStrategy({
  secret: process.env.JWT_SECRET, // Use strong random secret
  expiresIn: "1h",
  issuer: "myapp.com",
  audience: "myapp.com",
});
```

### Password Hashing

```typescript
import * as bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

## Authorization

### Role-Based Access Control

```typescript
import { Roles } from "@nyala/security";

@Controller("/admin")
export class AdminController {
  @Get("/users")
  @Roles("admin", "superadmin")
  listAllUsers() {
    return this.usersService.findAll();
  }
}
```

### Guards

```typescript
import { AuthGuard, RolesGuard } from "@nyala/security";

@Controller("/protected")
@UseGuards(AuthGuard, RolesGuard)
export class ProtectedController {
  // All routes require authentication and role checks
}
```

## Security Headers

Nyala enables security headers by default:

- **Helmet** - Sets secure HTTP headers
- **CORS** - Configurable cross-origin resource sharing
- **Rate Limiting** - Prevents brute force attacks
- **CSRF Protection** - Protects against cross-site request forgery

## Best Practices

1. **Never commit secrets** to version control
2. **Use environment variables** for sensitive configuration
3. **Rotate JWT secrets** regularly
4. **Implement refresh token rotation**
5. **Enable HTTPS** in production
6. **Monitor failed authentication attempts**
7. **Implement account lockout** after failed attempts
8. **Use strong password policies**
9. **Enable audit logging** for security events
10. **Regular security audits** of dependencies

## Audit Logging

```typescript
import { AuditInterceptor } from "@nyala/audit";

@Controller("/users")
@UseInterceptors(AuditInterceptor)
export class UsersController {
  // All actions automatically logged
}
```

## Production Checklist

- [ ] Change default JWT secret
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Set up audit logging
- [ ] Configure security headers
- [ ] Implement CSRF protection
- [ ] Set up monitoring and alerts
- [ ] Regular dependency updates
- [ ] Security penetration testing
