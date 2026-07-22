# Project Structure

Understanding Nyala's project structure helps you navigate and organize your code effectively.

## Standard Structure

```
my-app/
├── app/
│   ├── controllers/         # HTTP request handlers
│   ├── services/            # Business logic
│   ├── repositories/        # Data access layer
│   ├── models/              # Type definitions
│   ├── dto/                 # Data transfer objects
│   ├── validators/          # Request validators
│   ├── middleware/          # Custom middleware
│   ├── guards/              # Route guards
│   ├── helpers/             # Utility functions
│   └── app.module.ts        # Root module
├── database/
│   ├── schema/              # Database schemas
│   ├── migrations/          # Database migrations
│   ├── seeders/             # Data seeders
│   └── connection.ts        # Database connection
├── config/
│   ├── app.config.ts        # App configuration
│   ├── database.config.ts   # Database configuration
│   └── auth.config.ts       # Auth configuration
├── docs/                    # Documentation
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── e2e/                 # End-to-end tests
├── .env                     # Environment variables
├── .env.example             # Environment template
├── docker-compose.yml       # Docker services
├── Dockerfile               # Container definition
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
└── main.ts                  # Application entry point
```

## Directory Breakdown

### app/

Contains your application code.

#### controllers/

Handle HTTP requests and responses:

```typescript
// app/controllers/users.controller.ts
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('/')
  async index() {
    return this.usersService.findAll();
  }
}
```

**Naming:** `*.controller.ts`

#### services/

Contain business logic:

```typescript
// app/services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private userRepo: UserRepository) {}

  async findAll() {
    return this.userRepo.findAll();
  }
}
```

**Naming:** `*.service.ts`

#### repositories/

Handle database operations:

```typescript
// app/repositories/users.repository.ts
@Injectable()
export class UsersRepository extends BaseRepository<User> {
  constructor() {
    super(users);
  }

  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }
}
```

**Naming:** `*.repository.ts`

#### dto/

Define data transfer objects:

```typescript
// app/dto/users/create-user.dto.ts
export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}
```

**Structure:**
```
dto/
├── users/
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   └── user-response.dto.ts
└── posts/
    ├── create-post.dto.ts
    └── update-post.dto.ts
```

#### validators/

Validation schemas using Zod:

```typescript
// app/validators/users/create-user.validator.ts
import { z } from 'zod';

export const CreateUserValidator = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});
```

**Structure:** Mirrors dto structure

### database/

Database-related files.

#### schema/

Drizzle ORM schemas:

```typescript
// database/schema/users.schema.ts
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

#### migrations/

Generated migration files:

```
migrations/
├── 0000_initial_schema.sql
├── 0001_add_users_table.sql
└── 0002_add_posts_table.sql
```

#### seeders/

Database seeders:

```typescript
// database/seeders/users.seeder.ts
import { db } from '../connection';
import { users } from '../schema/users.schema';

export async function seedUsers() {
  await db.insert(users).values([
    {
      email: 'admin@example.com',
      name: 'Admin User',
      password: await hash('password'),
    },
  ]);
}
```

### config/

Configuration files:

```typescript
// config/app.config.ts
export const appConfig = {
  port: parseInt(process.env.PORT || '3000'),
  environment: process.env.NODE_ENV || 'development',
  url: process.env.APP_URL || 'http://localhost:3000',
};
```

### tests/

Test files organized by type:

```
tests/
├── unit/
│   ├── services/
│   │   └── users.service.spec.ts
│   └── repositories/
│       └── users.repository.spec.ts
├── integration/
│   └── users.integration.spec.ts
└── e2e/
    └── auth.e2e.spec.ts
```

## Module-Based Structure

For larger applications, organize by feature modules:

```
app/
├── modules/
│   ├── users/
│   │   ├── controllers/
│   │   │   └── users.controller.ts
│   │   ├── services/
│   │   │   └── users.service.ts
│   │   ├── repositories/
│   │   │   └── users.repository.ts
│   │   ├── dto/
│   │   ├── validators/
│   │   └── users.module.ts
│   ├── auth/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── guards/
│   │   └── auth.module.ts
│   └── posts/
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       └── posts.module.ts
└── app.module.ts
```

## File Naming Conventions

### TypeScript Files

| Type | Pattern | Example |
|------|---------|---------|
| Controller | `*.controller.ts` | `users.controller.ts` |
| Service | `*.service.ts` | `users.service.ts` |
| Repository | `*.repository.ts` | `users.repository.ts` |
| DTO | `*.dto.ts` | `create-user.dto.ts` |
| Validator | `*.validator.ts` | `create-user.validator.ts` |
| Middleware | `*.middleware.ts` | `logging.middleware.ts` |
| Guard | `*.guard.ts` | `auth.guard.ts` |
| Model | `*.model.ts` | `user.model.ts` |
| Helper | `*.helper.ts` | `password.helper.ts` |

### Test Files

| Type | Pattern | Example |
|------|---------|---------|
| Unit Test | `*.spec.ts` | `users.service.spec.ts` |
| Integration | `*.integration.spec.ts` | `users.integration.spec.ts` |
| E2E | `*.e2e.spec.ts` | `auth.e2e.spec.ts` |

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `.env` | Environment variables |
| `docker-compose.yml` | Docker services |
| `Dockerfile` | Container definition |
| `.eslintrc.json` | ESLint rules |
| `.prettierrc` | Code formatting |
| `.gitignore` | Git ignore patterns |

## Entry Point

```typescript
// main.ts
import { NyalaFactory } from '@nyalajs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NyalaFactory.create(AppModule);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application running on port ${port}`);
}

bootstrap();
```

## Best Practices

### 1. Keep Files Small

Aim for 100-200 lines per file. Split large files:

```
// Instead of one large users.service.ts
services/
├── users.service.ts          # Main service
├── user-creation.service.ts  # User creation logic
└── user-password.service.ts  # Password operations
```

### 2. Group Related Code

```
// Feature-based grouping
users/
├── controllers/
├── services/
├── repositories/
├── dto/
└── validators/
```

### 3. Use Barrel Exports

```typescript
// app/dto/users/index.ts
export * from './create-user.dto';
export * from './update-user.dto';
export * from './user-response.dto';

// Import anywhere
import { CreateUserDto, UpdateUserDto } from '@/dto/users';
```

### 4. Separate Concerns

```
// ✅ Good: Clear separation
controllers/users.controller.ts    # HTTP handling
services/users.service.ts           # Business logic
repositories/users.repository.ts    # Data access

// ❌ Bad: Mixed concerns
users.ts                            # Everything together
```

### 5. Consistent Naming

```typescript
// ✅ Good: Consistent naming
UsersController
UsersService
UsersRepository
CreateUserDto
UpdateUserDto

// ❌ Bad: Inconsistent
UserController    // Missing 's'
UserService
UserRepo          // Abbreviated
CreateUserRequest // Different suffix
UpdateUser        // Missing suffix
```

## SaaS/Multi-Tenant Structure

For SaaS applications, add tenant-specific organization:

```
app/
├── tenancy/
│   ├── tenant.model.ts
│   ├── tenant-context.service.ts
│   ├── tenant.middleware.ts
│   └── tenant.guard.ts
├── repositories/
│   └── base.repository.ts      # Tenant-aware base
└── modules/
    └── users/                   # Automatically tenant-scoped
```

## Next Steps

- [Architecture Overview](./architecture) - Understand the layers
- [Dependency Injection](./dependency-injection) - Learn about DI
- [Modules](../building-blocks/modules) - Organize code with modules
