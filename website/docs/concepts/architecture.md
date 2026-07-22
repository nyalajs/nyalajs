# Architecture Overview

Nyala follows a clean, layered architecture that separates concerns and makes applications maintainable and scalable.

## Architectural Layers

```
┌─────────────────────────────────────┐
│         HTTP Layer                  │
│    (Controllers, Middleware)        │
├─────────────────────────────────────┤
│       Business Logic Layer          │
│          (Services)                 │
├─────────────────────────────────────┤
│       Data Access Layer             │
│        (Repositories)               │
├─────────────────────────────────────┤
│         Database Layer              │
│     (Models, Migrations)            │
└─────────────────────────────────────┘
```

## Layer Responsibilities

### HTTP Layer (Controllers)

Handles HTTP requests and responses. Controllers should be thin and delegate to services.

```typescript
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  async index(@Query() query: PaginationDto) {
    return this.usersService.findAll(query);
  }

  @Post('/')
  @UseValidation(CreateUserValidator)
  async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

**Responsibilities:**
- Handle HTTP requests/responses
- Request validation
- Authentication/authorization checks
- Parameter extraction
- Response formatting

**Don't:**
- Put business logic in controllers
- Access database directly
- Perform calculations

### Business Logic Layer (Services)

Contains application business logic. Services orchestrate between controllers and repositories.

```typescript
@Injectable()
export class UsersService {
  constructor(
    private userRepo: UserRepository,
    private emailService: EmailService
  ) {}

  async create(dto: CreateUserDto) {
    // Business logic
    const hashedPassword = await hash(dto.password);
    const user = await this.userRepo.create({
      ...dto,
      password: hashedPassword,
    });

    // Orchestrate other services
    await this.emailService.sendWelcome(user.email);

    return user;
  }

  async findAll(query: PaginationDto) {
    return this.userRepo.findAll({
      limit: query.limit,
      offset: query.offset,
    });
  }
}
```

**Responsibilities:**
- Business logic implementation
- Transaction management
- Service orchestration
- Data transformation
- Error handling

**Don't:**
- Access HTTP request/response objects
- Construct database queries directly

### Data Access Layer (Repositories)

Manages database operations. Repositories abstract database access.

```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(users);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne(eq(users.email, email));
  }

  async findActive(): Promise<User[]> {
    return this.findAll({
      where: eq(users.active, true),
    });
  }
}
```

**Responsibilities:**
- Database queries
- Data persistence
- Query optimization
- Data mapping
dated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

## Data Flow

### Request Flow

```
Client Request
    ↓
Middleware (auth, logging, etc.)
    ↓
Controller (handle request)
    ↓
Service (business logic)
    ↓
Repository (data access)
    ↓
Database
```

### Response Flow

```
Database
    ↓
Repository (return data)
    ↓
Service (transform data)
    ↓
Controller (format response)
    ↓
Middleware (logging, etc.)
    ↓
Client Response
```

## Dependency Injection

Nyala uses constructor-based dependency injection:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private orderRepo: OrderRepository,
    private productService: ProductService,
    private emailService: EmailService,
    private paymentService: PaymentService
  ) {}

  async create(dto: CreateOrderDto) {
    // All dependencies are automatically injected
    const product = await this.productService.findById(dto.productId);
    const order = await this.orderRepo.create(dto);
    await this.paymentService.charge(order);
    await this.emailService.sendReceipt(order);
    return order;
  }
}
```

### Benefits

- **Testability**: Easy to mock dependencies
- **Loose coupling**: Components don't create dependencies
- **Reusability**: Services can be used anywhere
- **Maintainability**: Clear dependency graph

## Module System

Modules organize your application:

```typescript
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, UserRepository],
  exports: [UsersService],
})
export class UsersModule {}
```

### Module Organization

```
app/
├── modules/
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   ├── users.module.ts
│   │   └── dto/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   └── orders/
│       ├── orders.controller.ts
│       ├── orders.service.ts
│       ├── orders.repository.ts
│       └── orders.module.ts
└── app.module.ts
```

## Cross-Cutting Concerns

### Middleware

Handles cross-cutting concerns:

```typescript
@Injectable()
export class LoggingMiddleware implements Middleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.path}`);
    next();
  }
}
```

### Guards

Protect routes:

```typescript
@Injectable()
export class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return !!request.user;
  }
}
```

### Interceptors

Transform responses:

```typescript
@Injectable()
export class TransformInterceptor implements Interceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map(data => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }))
    );
  }
}
```

## Design Principles

### 1. Separation of Concerns

Each layer has a single responsibility:
- Controllers handle HTTP
- Services handle business logic
- Repositories handle data access

### 2. Dependency Inversion

High-level modules don't depend on low-level modules. Both depend on abstractions:

```typescript
// Abstract interface
interface PaymentGateway {
  charge(amount: number): Promise<void>;
}

// Service depends on abstraction
@Injectable()
export class OrdersService {
  constructor(private paymentGateway: PaymentGateway) {}
}

// Concrete implementation
@Injectable()
export class StripeGateway implements PaymentGateway {
  async charge(amount: number) {
    // Stripe-specific implementation
  }
}
```

### 3. Don't Repeat Yourself (DRY)

Extract common logic:

```typescript
// Base repository for common operations
export abstract class BaseRepository<T> {
  async findAll() { /* ... */ }
  async findById(id: string) { /* ... */ }
  async create(data: Partial<T>) { /* ... */ }
  async update(id: string, data: Partial<T>) { /* ... */ }
  async delete(id: string) { /* ... */ }
}

// Specific repositories extend base
export class UserRepository extends BaseRepository<User> {
  // Only add user-specific methods
}
```

### 4. Single Responsibility

Each class has one reason to change:

```typescript
// ❌ Bad: Multiple responsibilities
class UserService {
  async create(dto) { /* ... */ }
  async sendEmail(user) { /* ... */ }
  async hashPassword(password) { /* ... */ }
}

// ✅ Good: Single responsibility
class UserService {
  constructor(
    private emailService: EmailService,
    private hashService: HashService
  ) {}

  async create(dto) {
    const hashedPassword = await this.hashService.hash(dto.password);
    const user = await this.userRepo.create({ ...dto, password: hashedPassword });
    await this.emailService.sendWelcome(user);
    return user;
  }
}
```

## Scalability Patterns

### Microservices

Modules can become microservices:

```typescript
// Monolith
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}

// Microservice (same code!)
async function bootstrap() {
  const app = await NyalaFactory.createMicroservice(UsersModule);
  await app.listen();
}
```

### Event-Driven

Decouple services with events:

```typescript
@Injectable()
export class OrdersService {
  constructor(private eventEmitter: EventEmitter) {}

  async create(dto: CreateOrderDto) {
    const order = await this.orderRepo.create(dto);

    // Emit event instead of direct coupling
    this.eventEmitter.emit('order.created', order);

    return order;
  }
}

// Separate listener
@Injectable()
export class EmailListener {
  @On('order.created')
  async handleOrderCreated(order: Order) {
    await this.emailService.sendReceipt(order);
  }
}
```

## Next Steps

- [Project Structure](./structure) - File organization
- [Dependency Injection](./dependency-injection) - DI deep dive
- [Lifecycle Hooks](./lifecycle) - Application lifecycle
