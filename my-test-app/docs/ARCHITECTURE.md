# MVC Architecture Guide

## Overview

This starter kit follows the Model-View-Controller (MVC) architectural pattern, adapted for modern API-first applications. Since we're building APIs (not server-rendered views), the "View" layer is replaced with **Resources** (response transformers) and **DTOs** (Data Transfer Objects).

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                      HTTP Request                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   CONTROLLERS                            │
│  • Handle HTTP requests/responses                        │
│  • Validate input (using validators)                     │
│  • Delegate to services                                  │
│  • Transform responses (using resources)                 │
└────────────────────┬────────────────────────────────────┘
                     │
─────────────────────────────────┐
│                 REPOSITORIES                             │
│  • Data access layer                                     │
│  • Database queries                                      │
│  • CRUD operations                                       │
│  • Query builders                                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    MODELS                                │
│  • Database schema (Drizzle ORM)                         │
│  • Type definitions                                      │
│  • Table structures                                      │
└─────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### 1. Controllers (`app/controllers/`)

Controllers are the entry point for HTTP requests. They should be **thin** and focus only on:

- Receiving HTTP requests
- Validating input (delegated to validators)
- Calling service methods
- Returning HTTP responses

**Example:**

```typescript
@Controller("/users")
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Get("/:id")
    async show(@Param("id") id: string) {
        const user = await this.usersService.findOne(id);
        if (!user) {
            return { statusCode: 404, message: "User not found" };
        }
        return new UserResource(user);
    }
}
```

**Don'ts:**
- ❌ Put business logic in controllers
- ❌ Make direct database queries
- ❌ Handle complex data transformations

### 2. Services (`app/services/`)

Services contain your **business logic**. They:

- Implement business rules
- Coordinate between multiple repositories
- Handle transactions
- Throw domain exceptions

**Example:**

```typescript
@Injectable()
export class UsersService {
    constructor(
        private userRepository: UserRepository,
        private logger: Logger
    ) {}

    async create(dto: CreateUserDto): Promise<User> {
        // Business logic: check if email exists
        if (await this.userRepository.emailExists(dto.email)) {
            throw new Error("Email already exists");
        }

        // Business logic: hash password
        const hashedPassword = await hashPassword(dto.password);

        // Delegate data access to repository
        const user = await this.userRepository.create({
            ...dto,
            password: hashedPassword,
        });

        this.logger.info("User created", { userId: user.id });

        return user;
    }
}
```

**Don'ts:**
- ❌ Handle HTTP concerns (status codes, headers)
- ❌ Know about request/response objects

### 3. Repositories (`app/repositories/`)

Repositories are the **data access layer**. They:

- Execute database queries
- Provide CRUD operations
- Build complex queries
- Abstract database implementation

**Example:**

```typescript
@Injectable()
export class UserRepository extends BaseRepository<User> {
    constructor() {
        super(users); // Drizzle table
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.findOne(eq(users.email, email));
    }

    async findActive(): Promise<User[]> {
        return this.findAll({ where: eq(users.isActive, true) });
    }
}
```

**Don'ts:**
- ❌ Include business logic
- ❌ Validate data (that's for services)

### 4. Models (`app/models/`)

Models define your **database schema** using Drizzle ORM:

```typescript
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password: varchar("password", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
```

## Supporting Layers

### DTOs (`app/dto/`)

Data Transfer Objects define the **shape of data** being transferred between layers:

```typescript
export class CreateUserDto {
    name!: string;
    email!: string;
    password!: string;
}
```

### Validators (`app/validators/`)

Validators define **validation rules** using Zod:

```typescript
export const CreateUserValidator = z.object({
    name: z.string().min(2).max(255),
    email: z.string().email(),
    password: z.string().min(8),
});
```

### Resources (`app/resources/`)

Resources transform database models into **API responses**:

```typescript
export class UserResource {
    constructor(private user: User) {}

    toJSON() {
        return {
            id: this.user.id,
            name: this.user.name,
            email: this.user.email,
            createdAt: this.user.createdAt,
            // Password is never exposed
        };
    }
}
```

### Middleware (`app/middleware/`)

Middleware intercepts requests for cross-cutting concerns:

```typescript
@Injectable()
export class AuthMiddleware {
    async use(req: Request, res: Response, next: NextFunction) {
        // Verify JWT token
        // Attach user to request
        next();
    }
}
```

### Helpers (`app/helpers/`)

Utility functions used across the application:

```typescript
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}
```

## Data Flow Example

Let's trace a request to create a user:

1. **HTTP Request arrives**
   ```
   POST /users
   Body: { name: "John", email: "john@example.com", password: "secret" }
   ```

2. **Controller receives request**
   ```typescript
   @Post("/")
   @UseValidation(CreateUserValidator)
   async store(@Body() dto: CreateUserDto) {
       const user = await this.usersService.create(dto);
       return new UserResource(user);
   }
   ```

3. **Validator validates input**
   ```typescript
   CreateUserValidator.parse(dto); // Throws if invalid
   ```

4. **Service applies business logic**
   ```typescript
   async create(dto: CreateUserDto) {
       // Check if email exists
       if (await this.userRepository.emailExists(dto.email)) {
           throw new Error("Email exists");
       }
       // Hash password
       dto.password = await hashPassword(dto.password);
       // Create user
       return this.userRepository.create(dto);
   }
   ```

5. **Repository executes query**
   ```typescript
   async create(data: Partial<User>) {
       const results = await db.insert(users).values(data).returning();
       return results[0];
   }
   ```

6. **Resource transforms response**
   ```typescript
   new UserResource(user).toJSON();
   // Returns: { id, name, email, createdAt }
   ```

7. **HTTP Response sent**
   ```json
   {
       "statusCode": 201,
       "message": "User created successfully",
       "data": {
           "id": "...",
           "name": "John",
           "email": "john@example.com",
           "createdAt": "2024-01-01T00:00:00Z"
       }
   }
   ```

## Best Practices

### Keep Controllers Thin

```typescript
// ❌ Bad: Business logic in controller
@Post("/")
async store(@Body() dto: CreateUserDto) {
    if (await this.userRepo.emailExists(dto.email)) {
        throw new Error("Email exists");
    }
    dto.password = await hashPassword(dto.password);
    return this.userRepo.create(dto);
}

// ✅ Good: Delegate to service
@Post("/")
async store(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
}
```

### Services Own Business Logic

```typescript
// ❌ Bad: Repository contains business logic
async create(dto: CreateUserDto) {
    if (await this.emailExists(dto.email)) {
        throw new Error("Email exists");
    }
    // ...
}

// ✅ Good: Service owns business rules
async create(dto: CreateUserDto) {
    if (await this.userRepo.emailExists(dto.email)) {
        throw new Error("Email exists");
    }
    dto.password = await hashPassword(dto.password);
    return this.userRepo.create(dto);
}
```

### Repositories Only Query

```typescript
// ❌ Bad: Repository hashes passwords
async create(dto: CreateUserDto) {
    dto.password = await hashPassword(dto.password);
    return db.insert(users).values(dto);
}

// ✅ Good: Repository just inserts
async create(data: Partial<User>) {
    return db.insert(users).values(data).returning();
}
```

## Dependency Injection

All layers use dependency injection:

```typescript
@Injectable()
export class UsersService {
    constructor(
        private userRepository: UserRepository,  // Injected
        private logger: Logger                    // Injected
    ) {}
}
```

Register providers in `bootstrap/app.module.ts`:

```typescript
@Module({
    providers: [
        UserRepository,
        UsersService,
        Logger,
    ],
    controllers: [
        UsersController,
    ],
})
export class AppModule {}
```

## Testing Strategy

### Unit Tests

Test each layer in isolation:

```typescript
describe("UsersService", () => {
    it("should create user", async () => {
        const mockRepo = {
            emailExists: jest.fn().mockResolvedValue(false),
            create: jest.fn().mockResolvedValue(mockUser),
        };

        const service = new UsersService(mockRepo, mockLogger);
        const user = await service.create(dto);

        expect(mockRepo.create).toHaveBeenCalled();
    });
});
```

### Integration Tests

Test layers working together:

```typescript
describe("POST /users", () => {
    it("should create user", async () => {
        const response = await request(app)
            .post("/users")
            .send({ name: "John", email: "john@example.com", password: "secret" });

        expect(response.status).toBe(201);
    });
});
```

## Summary

- **Controllers**: Handle HTTP, stay thin
- **Services**: Business logic, orchestration
- **Repositories**: Data access, queries only
- **Models**: Database schema definitions
- **DTOs**: Data shape between layers
- **Validators**: Input validation rules
- **Resources**: Response transformation
- **Middleware**: Cross-cutting concerns
- **Helpers**: Reusable utilities

This architecture provides:
- ✅ Clear separation of concerns
- ✅ Easy to test
- ✅ Easy to maintain
- ✅ Scalable structure
- ✅ Type-safe end-to-end
