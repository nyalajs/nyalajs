# API Reference

## Core Decorators

### @Module()

Defines a module with its dependencies and exports.

```typescript
@Module({
  imports: [UserModule],
  providers: [AppService],
  controllers: [AppController],
  exports: [AppService],
})
export class AppModule {}
```

### @Injectable()

Marks a class as a provider that can be injected.

```typescript
@Injectable()
export class UsersService {
  // ...
}
```

### @Controller()

Defines a controller with a route prefix.

```typescript
@Controller("/users")
export class UsersController {
  // ...
}
```

### @Get(), @Post(), @Put(), @Delete(), @Patch()

HTTP method decorators for route handlers.

```typescript
@Get("/:id")
findOne(@Param("id") id: string) {
  return this.usersService.findOne(id);
}

@Post("/")
create(@Body() dto: CreateUserDto) {
  return this.usersService.create(dto);
}
```

### @Param(), @Body(), @Query(), @Headers()

Parameter decorators for extracting request data.

```typescript
@Get("/:id")
findOne(
  @Param("id") id: string,
  @Query("include") include: string,
  @Headers("authorization") auth: string
) {
  // ...
}

@Post("/")
create(@Body() dto: CreateUserDto) {
  // ...
}
```

## Security Decorators

### @Roles()

Requires specific roles for access.

```typescript
@Get("/admin")
@Roles("admin", "superadmin")
adminOnly() {
  // ...
}
```

### @UseGuards()

Applies guards to routes.

```typescript
@Controller("/protected")
@UseGuards(AuthGuard, RolesGuard)
export class ProtectedController {
  // ...
}
```

## Lifecycle Hooks

### OnModuleInit

Called when the module is initialized.

```typescript
@Injectable()
export class MyService implements OnModuleInit {
  onModuleInit() {
    console.log("Module initialized");
  }
}
```

### OnApplicationBootstrap

Called when the application starts.

```typescript
@Injectable()
export class MyService implements OnApplicationBootstrap {
  onApplicationBootstrap() {
    console.log("Application started");
  }
}
```

### OnApplicationShutdown

Called when the application shuts down.

```typescript
@Injectable()
export class MyService implements OnApplicationShutdown {
  onApplicationShutdown() {
    console.log("Application shutting down");
  }
}
```

## Services

### ConfigService

Manages application configuration.

```typescript
constructor(private config: ConfigService) {}

getValue() {
  return this.config.get("KEY", "default");
}
```

### Logger

Structured logging service.

```typescript
constructor(private logger: Logger) {}

logInfo() {
  this.logger.info("Message", { metadata: "value" });
}
```

### MetricsCollector

Collects Prometheus metrics.

```typescript
constructor(private metrics: MetricsCollector) {}

recordMetric() {
  this.metrics.incrementCounter("http_requests_total", {
    method: "GET",
    path: "/users",
  });
}
```

### HealthCheckService

Manages health checks.

```typescript
constructor(private health: HealthCheckService) {}

async checkHealth() {
  return await this.health.checkReadiness();
}
```

## Multi-Tenancy

### TenantRepository

Base class for tenant-aware repositories.

```typescript
@Injectable()
export class UserRepository extends TenantRepository<User> {
  async find(criteria: any): Promise<User[]> {
    const tenantId = this.getTenantId();
    return await this.db.users.find({ ...criteria, tenantId });
  }
}
```

## Audit

### AuditLogger

Logs audit events.

```typescript
constructor(private audit: AuditLogger) {}

async logEvent() {
  await this.audit.log({
    actorId: "user-123",
    action: "create",
    resourceType: "user",
    resourceId: "user-456",
    // ...
  });
}
```
