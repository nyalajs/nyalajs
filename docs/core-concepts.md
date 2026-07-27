# Core Concepts

This guide covers the fundamental concepts and patterns in Nyala Framework.

## Architecture Overview

Nyala follows a modular, layered architecture inspired by enterprise frameworks like NestJS and Spring Boot:

```
┌─────────────────────────────────────┐
│         HTTP Layer (Fastify)        │
│  Controllers → Guards → Interceptors│
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Application Layer             │
│    Services → Business Logic        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Data Layer                    │
│  Repositories → Database (Drizzle)  │
└─────────────────────────────────────┘
```

## Module System

Modules organize your application into cohesive units. Each module declares its providers, controllers, and dependencies.

### Defining a Module

```typescript
import { Module } from "@nyalajs/core";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UsersRepository } from "./users.repository";

@Module({
    providers: [UsersService, UsersRepository],
    controllers: [UsersController],
    imports: [], // Other modules this module depends on
    exports: [UsersService], // Services to make available to other modules
})
export class UsersModule {}
```

### Root Module

Your application has one root module (`AppModule`) that bootstraps the entire application:

```typescript
import { Module } from "@nyalajs/core";
import { UsersModule } from "./users/users.module";

@Module({
    imports: [UsersModule],
})
export class AppModule {}
```

## Dependency Injection

Nyala has a powerful DI container that manages object lifecycles and dependencies.

### Injectable Services

Mark classes as injectable with the `@Injectable()` decorator:

```typescript
import { Injectable } from "@nyalajs/core";

@Injectable()
export class UsersService {
    findAll() {
        return [];
    }
}
```

### Constructor Injection

Dependencies are injected through the constructor:

```typescript
import { Injectable } from "@nyalajs/core";

@Injectable()
export class UsersService {
    constructor(
        private usersRepository: UsersRepository,
        private logger: Logger,
    ) {}

    async findAll() {
        this.logger.info("Finding all users");
        return this.usersRepository.find();
    }
}
```

### Injection Scopes

Nyala supports three injection scopes. `@Injectable()` itself takes no
options — scope is set where a provider is *registered* in a module, not on
the class declaration:

```typescript
import { Injectable, Scope, Module } from "@nyalajs/core";

@Injectable()
export class ConfigService {}

@Injectable()
export class RequestContextService {}

@Injectable()
export class TemporaryService {}

@Module({
    providers: [
        // SINGLETON (default) - one instance for the entire app lifecycle.
        // A bare class reference (no wrapper object) is always SINGLETON.
        ConfigService,

        // REQUEST - one instance per HTTP request
        {
            provide: RequestContextService,
            useClass: RequestContextService,
            scope: Scope.REQUEST,
        },

        // TRANSIENT - new instance every time it's injected
        {
            provide: TemporaryService,
            useClass: TemporaryService,
            scope: Scope.TRANSIENT,
        },
    ],
})
export class AppModule {}
```

### Custom Providers

For advanced scenarios, use factory providers:

```typescript
@Module({
    providers: [
        {
            provide: "DATABASE_CONNECTION",
            useFactory: (config: ConfigService) => {
                return createConnection(config.get("database.url"));
            },
            inject: [ConfigService],
        },
    ],
})
export class DatabaseModule {}
```

## Controllers

Controllers handle HTTP requests and delegate business logic to services.

### Basic Controller

```typescript
import { Controller, Get, Post, Body, Param } from "@nyalajs/core";

@Controller("/users")
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Get("/")
    findAll() {
        return this.usersService.findAll();
    }

    @Get("/:id")
    findOne(@Param("id") id: string) {
        return this.usersService.findOne(id);
    }

    @Post("/")
    create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }
}
```

### Route Parameters

Extract data from requests using decorators:

```typescript
import { Controller, Get, Post, Query, Param, Body, Headers } from "@nyalajs/core";

@Controller("/users")
export class UsersController {
    @Get("/")
    findAll(@Query("page") page: number, @Query("limit") limit: number) {
        return this.usersService.findAll({ page, limit });
    }

    @Get("/:id")
    findOne(@Param("id") id: string) {
        return this.usersService.findOne(id);
    }

    @Post("/")
    create(@Body() dto: CreateUserDto, @Headers("x-tenant-id") tenantId: string) {
        return this.usersService.create(dto, tenantId);
    }
}
```

## Providers and Services

Services contain business logic and are injected into controllers.

### Service Pattern

```typescript
import { Injectable } from "@nyalajs/core";

@Injectable()
export class UsersService {
    constructor(
        private usersRepository: UsersRepository,
        private logger: Logger,
    ) {}

    async create(dto: CreateUserDto) {
        this.logger.info("Creating user", { email: dto.email });

        // Validate
        if (await this.usersRepository.existsByEmail(dto.email)) {
            throw new ConflictException("Email already exists");
        }

        // Create
        const user = await this.usersRepository.create(dto);

        // Emit event
        this.eventEmitter.emit("user.created", { userId: user.id });

        return user;
    }
}
```

## Middleware

Middleware executes before route handlers and can modify requests/responses.

### Creating Middleware

Middleware implements `Middleware` from `@nyalajs/http` — the same
`(req, res, next)` convention used by Express/Fastify, not `ExecutionContext`:

```typescript
import { Injectable } from "@nyalajs/core";
import { Middleware, NextFunction } from "@nyalajs/http";

@Injectable()
export class LoggingMiddleware implements Middleware {
    constructor(private logger: Logger) {}

    async use(req: any, res: any, next: NextFunction): Promise<void> {
        const start = Date.now();

        this.logger.info("Incoming request", {
            method: req.method,
            url: req.url,
        });

        await next();

        this.logger.info("Request completed", {
            duration: Date.now() - start,
        });
    }
}
```

### Applying Middleware

There's no per-controller middleware decorator — middleware is registered
globally on the application, and runs before every route handler in the
order `use()` is called:

```typescript
const app = await NyalaFactory.create(AppModule);
app.setHttpAdapter(new FastifyAdapter(app.getKernel().getContainer()));

app.use(new LoggingMiddleware(logger));

await app.listen(3000);
```

## Guards

Guards determine if a request should be handled by a route handler.

### Authentication Guard

`Guard` and `ExecutionContext` live in `@nyalajs/http`, not `@nyalajs/core`.
`ExecutionContext` exposes `request`/`response`/`context` directly — there's
no `switchToHttp()`:

```typescript
import { Injectable } from "@nyalajs/core";
import { Guard, ExecutionContext } from "@nyalajs/http";

@Injectable()
export class AuthGuard implements Guard {
    canActivate(context: ExecutionContext): boolean {
        return context.request.user !== undefined;
    }
}
```

### Using Guards

```typescript
import { Controller, Get, UseGuards } from "@nyalajs/core";
import { Roles, RolesGuard } from "@nyalajs/security";

@Controller("/admin")
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
    @Get("/users")
    @Roles("admin")
    listUsers() {
        return this.usersService.findAll();
    }
}
```

## Interceptors

Interceptors can transform requests/responses or add cross-cutting concerns.

### Logging Interceptor

`Interceptor` and `ExecutionContext` also live in `@nyalajs/http`:

```typescript
import { Injectable } from "@nyalajs/core";
import { Interceptor, ExecutionContext } from "@nyalajs/http";

@Injectable()
export class LoggingInterceptor implements Interceptor {
    async intercept(context: ExecutionContext, next: () => Promise<any>) {
        console.log("Before...");
        const result = await next();
        console.log("After...");
        return result;
    }
}
```

### Transform Response

```typescript
@Injectable()
export class TransformInterceptor implements Interceptor {
    async intercept(context: ExecutionContext, next: () => Promise<any>) {
        const data = await next();
        return {
            success: true,
            data,
            timestamp: new Date().toISOString(),
        };
    }
}
```

## Exception Handling

Nyala provides built-in exception classes for common HTTP errors.

### Built-in Exceptions

Exception classes live in `@nyalajs/http`, not `@nyalajs/core`:

```typescript
import { Injectable } from "@nyalajs/core";
import {
    BadRequestException,
    UnauthorizedException,
    NotFoundException,
    ConflictException,
    InternalServerErrorException,
} from "@nyalajs/http";

@Injectable()
export class UsersService {
    async findOne(id: string) {
        const user = await this.usersRepository.findById(id);

        if (!user) {
            throw new NotFoundException(`User ${id} not found`);
        }

        return user;
    }
}
```

### Custom Exceptions

```typescript
export class EmailAlreadyExistsException extends ConflictException {
    constructor(email: string) {
        super(`User with email ${email} already exists`);
    }
}
```

## Request Context

Each request carries a `RequestContext` object (`@nyalajs/http`) —
`requestId`, `traceId`, `tenantId`, `userId`, `locale`, `startedAt`, and a
`metadata` map — attached to `ExecutionContext.context`. It's *not* a
globally-accessible static class; middleware, guards, and interceptors read
and write it because they're each handed the `ExecutionContext` (or the
raw `req`) for the current request.

### Reading and writing it

Guards typically populate it (this is what `AuthGuard` does after verifying
a JWT):

```typescript
import { Guard, ExecutionContext } from "@nyalajs/http";

export class AuthGuard implements Guard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const identity = await this.verify(context.request);
        if (!identity) return false;

        context.context.userId = identity.userId;
        context.context.tenantId = identity.tenantId;
        return true;
    }
}
```

Interceptors and later guards in the pipeline can read those same fields
off `context.context`.

### Tenant ID: the one ambient exception

For the specific case of the current tenant, `TenantContext`
(`@nyalajs/core`) *is* backed by `AsyncLocalStorage`, so it's readable from
anywhere in the call stack for the current request — including
`@nyalajs/database`'s `Model`, which has no access to `ExecutionContext` at
all:

```typescript
import { TenantContext } from "@nyalajs/core";

@Injectable()
export class UsersService {
    async findAll() {
        const tenantId = TenantContext.get();
        // Model.all()/find()/save()/create()/delete() already read this
        // automatically for any tenant-scoped table — you don't need to
        // pass it through manually.
        return User.all();
    }
}
```

`TenantMiddleware` (`@nyalajs/tenancy`) is what populates it, using the
standard `Middleware` signature:

```typescript
import { TenantContext } from "@nyalajs/core";
import { Middleware, NextFunction } from "@nyalajs/http";

export class TenantMiddleware implements Middleware {
    async use(req: any, res: any, next: NextFunction): Promise<void> {
        const tenantId = req.headers["x-tenant-id"];
        TenantContext.set(tenantId);
        await next();
    }
}
```

## Lifecycle Hooks

Providers can implement lifecycle hooks:

```typescript
import { Injectable, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown } from "@nyalajs/core";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
    async onModuleInit() {
        console.log("Module initialized");
        await this.connect();
    }

    async onApplicationShutdown() {
        console.log("Application shutting down");
        await this.disconnect();
    }
}
```

Available hooks:
- `onModuleInit()` - Called after module dependencies are resolved
- `onApplicationBootstrap()` - Called after all modules are initialized
- `onApplicationShutdown()` - Called before application shutdown

## Configuration

Use `@nyalajs/config` for type-safe configuration management.

### Defining Config

```typescript
// config/database.ts
export default {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "nyala",
};
```

### Using Config

```typescript
import { Injectable } from "@nyalajs/core";
import { ConfigService } from "@nyalajs/config";

@Injectable()
export class DatabaseService {
    constructor(private config: ConfigService) {
        const host = this.config.get("database.host");
        const port = this.config.get("database.port");
    }
}
```

## Next Steps

- [Multi-Tenancy Guide](./multi-tenancy.md) - Learn about tenant isolation
- [Security Best Practices](./security.md) - Secure your application
- [API Reference](./api-reference.md) - Detailed API documentation
