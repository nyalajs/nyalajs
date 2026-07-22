# Middleware

Middleware functions process HTTP requests before they reach your route handlers. Use them for logging, authentication, rate limiting, and more.

## Basic Middleware

Create a middleware with the `@Injectable()` decorator:

```typescript
import { Injectable, Middleware } from '@nyala/core';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.path}`);
    next();
  }
}
```

## Registering Middleware

### Global Middleware

Apply to all routes:

```typescript
// main.ts
import { NyalaFactory } from '@nyala/core';
import { AppModule } from './app/app.module';
import { LoggingMiddleware } from './app/middleware/logging.middleware';

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);

  // Apply globally
  app.use(LoggingMiddleware);

  await app.listen(3000);
}
```

### Module Middleware

Apply to specific m
      .forRoutes({ path: 'users', method: RequestMethod.POST });
  }
}
```

## Common Middleware Examples

### Request Logging

```typescript
@Injectable()
export class RequestLoggerMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  }
}
```

### Authentication

```typescript
@Injectable()
export class AuthMiddleware implements Middleware {
  constructor(private jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = this.jwt');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    next();
  }
}
```

### Rate Limiting

```typescript
@Injectable()
export class RateLimitMiddleware implements Middleware {
  private requests = new Map<string, number[]>();
  private readonly limit = 100;
  private readonly window = 15 * 60 * 1000; // 15 minutes

  use(req: Request, res: Response, next: NextFunction) {
    const key = req.ip;
    const now = Date.now();

    // Get request timestamps
    const tiateLimit-Remaining', (this.limit - recentRequests.length).toString());

    next();
  }
}
```

### Request ID

```typescript
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.headers['x-request-id'] = requestId as string;
    res.setHeader('X-Request-ID', requestId);
    next();
  }
}
```

### Body Size Limiter

```typescript
@Injectable()
export class BodySizeLimitMiddleware implements Middleware {
  private readonly maxSize = 10 * 1024 * 1024; // 10MB

  use(req: Request, res: Response, next: NextFunction) {
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > this.maxSize) {
      throw new PayloadTooLargeException('Request body too large');
    }

    next();
  }
}
```

### Tenant Context

```typescript
@Injectable()
export class TenantMiddleware implements Middleware {
  constructor(private tenantContext: TenantContext) {}

  use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      throw new BadRequestException('Tenant ID required');
    }

    this.tenantContext.setTenantId(tenantId);
    next();
  }
}
```

## Async Middleware

Handle async operations:

```typescript
@Injectable()
export class DatabaseHealthMiddleware implements Middleware {
  constructor(private db: DatabaseService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      await this.db.ping();
      next();
    } catch (error) {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
```

## Error Handling Middleware

```typescript
@Injectable()
export class ErrorHandlerMiddleware implements Middleware {
  use(err: Error, req: Request, res: Response, next: NextFunction) {
    console.error('Error:', err);

    const statusCode = err instanceof HttpException
      ? err.getStatus()
      : 500;

    const message = err instanceof HttpException
      ? err.message
      : 'Internal server error';

    res.status(statusCode).json({
      statusCode,
      message,
      path: req.path,
      timestamp: new Date().toISOString(),
    });
  }
}
```

## Middleware with Configuration

```typescript
export interface CacheConfig {
  ttl: number;
  keyPrefix: string;
}

@Injectable()
export class CacheMiddleware implements Middleware {
  constructor(
    private config: CacheConfig,
    private cacheService: CacheService
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET') {
      return next();
    }

    const key = `${this.config.keyPrefix}:${req.path}`;
    const cached = await this.cacheService.get(key);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Override res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      this.cacheService.set(key, JSON.stringify(body), this.config.ttl);
      return originalJson(body);
    };

    next();
  }
}
```

## Middleware Order

Order matters - middleware executes in sequence:

```typescript
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestIdMiddleware,      // 1. Generate request ID
        LoggingMiddleware,        // 2. Log request
        CorsMiddleware,           // 3. Handle CORS
        RateLimitMiddleware,      // 4. Check rate limits
        AuthMiddleware,           // 5. Authenticate
        TenantMiddleware,         // 6. Set tenant context
      )
      .forRoutes('*');
  }
}
```

## Conditional Middleware

Apply middleware conditionally:

```typescript
@Injectable()
export class ConditionalAuthMiddleware implements Middleware {
  constructor(private jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Skip auth for public routes
    const publicRoutes = ['/health', '/auth/login', '/auth/register'];
    if (publicRoutes.includes(req.path)) {
      return next();
    }

    // Require auth for all other routes
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token required');
    }

    try {
      req.user = this.jwtService.verify(token);
      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

## Functional Middleware

Use plain functions:

```typescript
export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.path}`);
  next();
}

// Apply in main.ts
app.use(logger);

// Or with Express middleware
import helmet from 'helmet';
import compression from 'compression';

app.use(helmet());
app.use(compression());
```

## Best Practices

### 1. Keep Middleware Focused

```typescript
// ✅ Good: Single responsibility
@Injectable()
export class LoggingMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.path}`);
    next();
  }
}

// ❌ Bad: Multiple responsibilities
@Injectable()
export class MixedMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Logging
    console.log(req.path);
    // Auth
    if (!req.headers.authorization) throw new Error();
    // Rate limiting
    if (this.rateLimitExceeded(req.ip)) throw new Error();
    next();
  }
}
```

### 2. Always Call next()

```typescript
// ✅ Good: Always call next
use(req: Request, res: Response, next: NextFunction) {
  console.log('Processing');
  next();
}

// ❌ Bad: Forgot next()
use(req: Request, res: Response, next: NextFunction) {
  console.log('Processing');
  // Request hangs!
}
```

### 3. Handle Errors Properly

```typescript
// ✅ Good: Proper error handling
async use(req: Request, res: Response, next: NextFunction) {
  try {
    await this.validateRequest(req);
    next();
  } catch (error) {
    next(error);  // Pass error to error handler
  }
}

// ❌ Bad: Silent failure
async use(req: Request, res: Response, next: NextFunction) {
  try {
    await this.validateRequest(req);
  } catch (error) {
    // Error swallowed!
  }
  next();
}
```

### 4. Use Dependency Injection

```typescript
// ✅ Good: Inject dependencies
@Injectable()
export class AuthMiddleware implements Middleware {
  constructor(private jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization;
    const user = this.jwtService.verify(token);
    req.user = user;
    next();
  }
}

// ❌ Bad: Direct instantiation
export class AuthMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    const jwtService = new JwtService();  // Don't do this
    // ...
  }
}
```

### 5. Document Middleware

```typescript
/**
 * Authentication Middleware
 *
 * Validates JWT token from Authorization header and attaches
 * user information to request object.
 *
 * @throws UnauthorizedException if token is missing or invalid
 */
@Injectable()
export class AuthMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    // ...
  }
}
```

## Next Steps

- [Guards](../features/authorization) - Route protection
- [Interceptors](../features/interceptors) - Response transformation
- [Error Handling](../features/error-handling) - Error management
