# Dependency Injection

Dependency Injection (DI) is a core feature of Nyala that manages class dependencies automatically.

## What is Dependency Injection?

Instead of creating dependencies manually:

```typescript
// ❌ Without DI: Manual dependency creation
class UsersController {
  private usersService: UsersService;

  constructor() {
    const userRepo = new UsersRepository();
    const emailService = new EmailService();
    this.usersService = new UsersService(userRepo, emailService);
  }
}
```

DI handles it automatically:

```typescript
// ✅ With DI: Automatic injection
@Controller('/users')
class UsersController {
  constructor(private usersService: UsersService) {}
  // usersService is automatically created and injected
}
```

## How It Works

### 1. Mark Injectable Classes

Use `@Injectable()` decorator:

```typescript
@Injectable()
export class UsersService {
  constructor(private userRepo: UsersRepository) {}

  async findAll() {
    return this.userRepo.findAll();
  }
}
```

### 2. Declare Dependencies

Add to constructor:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private orderRepo: OrderRepository,
    private emailService: EmailService,
    private paymentService: PaymentService
  ) {}
}
```

### 3. Register Providers

Register in module:

```typescript
@Module({
  providers: [
    OrdersService,
    OrderRepository,
    EmailService,
    PaymentService,
  ],
})
export class OrdersModule {}
```

That's it! Nyala handles the rest.

## Provider Types

### Class Providers

Most common type:

```typescript
@Module({
  providers: [UsersService],  // Shorthand
})

// Equivalent to:
@Module({
  providers: [
    {
      provide: UsersService,
      useClass: UsersService,
    },
  ],
})
```

### Value Providers

Provide constant values:

```typescript
@Module({
  providers: [
    {
      provide: 'API_KEY',
      useValue: process.env.API_KEY,
    },
    {
      provide: 'CONFIG',
      useValue: {
        timeout: 5000,
        retries: 3,
      },
    },
  ],
})
```

Inject with `@Inject()`:

```typescript
@Injectable()
export class ApiService {
  constructor(
    @Inject('API_KEY') private apiKey: string,
    @Inject('CONFIG') private config: any
  ) {}
}
```

### Factory Providers

Create instances dynamically:

```typescript
@Module({
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: async () => {
        const connection = await createConnection({
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
        });
        return connection;
      },
    },
  ],
})
```

With dependencies:

```typescript
{
  provide: 'LOGGER',
  useFactory: (config: ConfigService) => {
    return new Logger(config.get('LOG_LEVEL'));
  },
  inject: [ConfigService],
}
```

### Alias Providers

Create aliases:

```typescript
@Module({
  providers: [
    LoggerService,
    {
      provide: 'Logger',
      useExisting: LoggerService,
    },
  ],
})
```

## Injection Scopes

### Singleton (Default)

One instance shared across the application:

```typescript
@Injectable()
export class UsersService {
  // Single instance for entire app
}
```

### Request

New instance per request:

```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestLogger {
  // New instance for each request
}
```

### Transient

New instance every time it's injected:

```typescript
@Injectable({ scope: Scope.TRANSIENT })
export class UuidGenerator {
  // New instance every injection
}
```

## Injection Patterns

### Constructor Injection (Recommended)

```typescript
@Injectable()
export class UsersService {
  constructor(
    private userRepo: UsersRepository,
    private emailService: EmailService
  ) {}
}
```

**Benefits:**
- Clear dependencies
- Immutable after creation
- Easy to test

### Property Injection

```typescript
@Injectable()
export class UsersService {
  @Inject(UserRepository)
  private userRepo: UserRepository;
}
```

**Use when:**
- Optional dependencies
- Circular dependencies (rare)

## Circular Dependencies

Avoid circular dependencies, but if unavoidable:

### Forward Reference

```typescript
// users.service.ts
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService
  ) {}
}

// auth.service.ts
@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService
  ) {}
}
```

### Better: Refactor

```typescript
// Extract shared logic to a third service
@Injectable()
export class UserAuthService {
  // Shared logic
}

@Injectable()
export class UsersService {
  constructor(private userAuthService: UserAuthService) {}
}

@Injectable()
export class AuthService {
  constructor(private userAuthService: UserAuthService) {}
}
```

## Optional Dependencies

```typescript
@Injectable()
export class UsersService {
  constructor(
    private userRepo: UsersRepository,
    @Optional() private cacheService?: CacheService
  ) {}

  async findAll() {
    // Use cache if available
    if (this.cacheService) {
      const cached = await this.cacheService.get('users');
      if (cached) return cached;
    }

    return this.userRepo.findAll();
  }
}
```

## Custom Tokens

Use symbols or strings for non-class tokens:

```typescript
// tokens/database.token.ts
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

// Module
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: () => createConnection(),
    },
  ],
})

// Usage
@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: DatabaseConnection
  ) {}
}
```

## Interface-Based Injection

TypeScript interfaces don't exist at runtime, so use tokens:

```typescript
// interfaces/logger.interface.ts
export interface ILogger {
  log(message: string): void;
  error(message: string): void;
}

export const ILogger = Symbol('ILogger');

// Implementation
@Injectable()
export class ConsoleLogger implements ILogger {
  log(message: string) {
    console.log(message);
  }

  error(message: string) {
    console.error(message);
  }
}

// Module
@Module({
  providers: [
    {
      provide: ILogger,
      useClass: ConsoleLogger,
    },
  ],
})

// Usage
@Injectable()
export class UsersService {
  constructor(
    @Inject(ILogger)
    private logger: ILogger
  ) {}
}
```

## Testing with DI

DI makes testing easy:

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepo: MockUserRepository;

  beforeEach(() => {
    mockUserRepo = new MockUserRepository();
    service = new UsersService(mockUserRepo);
  });

  it('should find all users', async () => {
    mockUserRepo.findAll.mockResolvedValue([
      { id: '1', name: 'John' },
    ]);

    const users = await service.findAll();
    expect(users).toHaveLength(1);
  });
});
```

With testing utilities:

```typescript
describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findAll: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  it('should return users', async () => {
    const users = [{ id: '1', name: 'John' }];
    jest.spyOn(service, 'findAll').mockResolvedValue(users);

    const result = await controller.index();
    expect(result).toEqual(users);
  });
});
```

## Dynamic Modules

Create configurable modules:

```typescript
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        {
          provide: 'DATABASE_CONNECTION',
          useFactory: (opts) => createConnection(opts),
          inject: ['DATABASE_OPTIONS'],
        },
      ],
      exports: ['DATABASE_CONNECTION'],
    };
  }
}

// Usage
@Module({
  imports: [
    DatabaseModule.forRoot({
      host: 'localhost',
      port: 5432,
    }),
  ],
})
export class AppModule {}
```

## Best Practices

### 1. Constructor Injection

Always prefer constructor injection:

```typescript
// ✅ Good
constructor(private usersService: UsersService) {}

// ❌ Avoid
@Inject(UsersService)
private usersService: UsersService;
```

### 2. Single Responsibility

Keep providers focused:

```typescript
// ✅ Good: Focused services
@Injectable()
export class EmailService {
  async send(to: string, subject: string, body: string) {
    // Email logic only
  }
}

@Injectable()
export class UsersService {
  constructor(private emailService: EmailService) {}

  async create(dto: CreateUserDto) {
    const user = await this.userRepo.create(dto);
    await this.emailService.send(user.email, 'Welcome', 'Welcome to our app!');
    return user;
  }
}

// ❌ Bad: Mixed responsibilities
@Injectable()
export class UsersService {
  async create(dto: CreateUserDto) {
    const user = await this.userRepo.create(dto);
    // Email logic inline
    await sendgrid.send({ /* ... */ });
    return user;
  }
}
```

### 3. Avoid Circular Dependencies

Refactor to break cycles:

```typescript
// ❌ Bad: Circular
UsersService → AuthService → UsersService

// ✅ Good: Extracted dependency
UsersService → SharedService
AuthService → SharedService
```

### 4. Use Interfaces

Depend on abstractions:

```typescript
// ✅ Good
@Injectable()
export class OrdersService {
  constructor(
    @Inject(IPaymentGateway)
    private paymentGateway: IPaymentGateway
  ) {}
}

// ❌ Bad: Concrete dependency
@Injectable()
export class OrdersService {
  constructor(private stripeService: StripeService) {}
  // Tightly coupled to Stripe
}
```

### 5. Explicit Dependencies

Make dependencies obvious:

```typescript
// ✅ Good: Clear dependencies
@Injectable()
export class OrdersService {
  constructor(
    private orderRepo: OrderRepository,
    private emailService: EmailService,
    private paymentService: PaymentService
  ) {}
}

// ❌ Bad: Hidden dependencies
@Injectable()
export class OrdersService {
  async create(dto: CreateOrderDto) {
    const email = new EmailService();  // Hidden!
    const payment = new PaymentService();  // Hidden!
  }
}
```

## Next Steps

- [Lifecycle Hooks](./lifecycle) - Component lifecycle
- [Modules](../building-blocks/modules) - Organizing providers
- [Testing](../testing/unit) - Testing with DI
